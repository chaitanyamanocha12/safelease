/**
 * Investigation service: case lifecycle, append-only evidence ingestion,
 * claim corrections, snapshot loading and evaluation persistence.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  agentRun,
  claim,
  claimLink,
  evidence,
  finding,
  investigation,
  investigationAction,
  investigationEvent,
  toolRun,
  verificationCheck,
  verificationHistory,
  type EvidenceKind,
  type VerificationCheckType,
  type ClaimType,
} from "../db/schema";
import { newId } from "@/lib/ids";
import { AppError, notFound } from "../errors";
import { extractClaims } from "../extraction/extract-claims";
import type { CaseSnapshot, CheckRecord, FindingDraft, ImageMatchRecord, LinkDraft, RentContext } from "../investigation/types";
import type { ValidatedUpload } from "../security/upload";
import { audit } from "./audit";
import { storeDocument } from "./documents";
import { notify } from "./notifications";

export type InvestigationRow = typeof investigation.$inferSelect;

export async function createInvestigation(ownerId: string, input: { title: string; city?: string | null; listingId?: string | null; isDemo?: boolean; demoScenario?: string }) {
  const id = newId("inv");
  await db.insert(investigation).values({
    id,
    ownerId,
    title: input.title.slice(0, 140),
    city: input.city ?? null,
    listingId: input.listingId ?? null,
    status: "draft",
    isDemo: input.isDemo ?? false,
    demoScenario: input.demoScenario ?? null,
  });
  await logEvent(id, "case_created", "user", `Investigation “${input.title.slice(0, 80)}” created.`);
  await audit({ actorId: ownerId, action: "investigation.create", resourceType: "investigation", resourceId: id });
  return id;
}

export async function getInvestigationForUser(userId: string, id: string): Promise<InvestigationRow> {
  const [row] = await db.select().from(investigation).where(and(eq(investigation.id, id), eq(investigation.ownerId, userId)));
  if (!row) throw notFound("Investigation");
  return row;
}

export async function listInvestigations(userId: string, opts: { status?: InvestigationRow["status"]; page?: number; pageSize?: number } = {}) {
  const pageSize = Math.min(opts.pageSize ?? 20, 100);
  const page = Math.max(1, opts.page ?? 1);
  const where = opts.status ? and(eq(investigation.ownerId, userId), eq(investigation.status, opts.status)) : eq(investigation.ownerId, userId);
  const rows = await db.select().from(investigation).where(where).orderBy(desc(investigation.updatedAt)).limit(pageSize).offset((page - 1) * pageSize);
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({ investigationId: finding.investigationId, severity: finding.severity, n: sql<number>`count(*)` })
        .from(finding)
        .where(and(inArray(finding.investigationId, ids), eq(finding.lifecycle, "active")))
        .groupBy(finding.investigationId, finding.severity)
    : [];
  const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(investigation).where(where);
  return {
    total: Number(total),
    page,
    pageSize,
    items: rows.map((r) => ({
      ...r,
      serious: Number(counts.find((c) => c.investigationId === r.id && c.severity === "serious")?.n ?? 0),
      caution: Number(counts.find((c) => c.investigationId === r.id && c.severity === "caution")?.n ?? 0),
    })),
  };
}

export async function updateInvestigation(userId: string, id: string, patch: { title?: string; status?: InvestigationRow["status"]; city?: string | null }) {
  await getInvestigationForUser(userId, id);
  await db
    .update(investigation)
    .set({ ...patch, ...(patch.status === "closed" ? { closedAt: new Date() } : {}), updatedAt: new Date() })
    .where(eq(investigation.id, id));
  if (patch.status) await logEvent(id, "status_changed", "user", `Case status set to ${patch.status.replace("_", " ")}.`);
}

export async function deleteInvestigation(userId: string, id: string) {
  await getInvestigationForUser(userId, id);
  await db.delete(investigation).where(eq(investigation.id, id));
  await audit({ actorId: userId, action: "investigation.delete", resourceType: "investigation", resourceId: id });
}

export async function logEvent(investigationId: string, eventType: string, actor: "user" | "agent" | "system", message: string, data?: Record<string, unknown>) {
  await db.insert(investigationEvent).values({ id: newId("evt"), investigationId, eventType, actor, message: message.slice(0, 500), data: data ?? null });
}

export async function bumpState(investigationId: string) {
  await db
    .update(investigation)
    .set({ stateVersion: sql`${investigation.stateVersion} + 1`, updatedAt: new Date() })
    .where(eq(investigation.id, investigationId));
}

// ── Evidence ───────────────────────────────────────────────────────────────

const KIND_TO_DOC: Record<EvidenceKind, Parameters<typeof storeDocument>[0]["docType"]> = {
  listing_text: "listing",
  listing_url: "listing",
  listing_screenshot: "listing",
  property_photo: "photo",
  pdf_document: "other",
  landlord_message: "conversation",
  landlord_response: "conversation",
  lease: "lease",
  supporting_document: "verification",
  manual_entry: "listing",
  viewing_note: "other",
};

export interface AddEvidenceInput {
  kind: EvidenceKind;
  title: string;
  text?: string | null;
  file?: ValidatedUpload | null;
  sourceUrl?: string | null;
  occurredAt?: Date | null;
  supersedesEvidenceId?: string | null;
  isDemo?: boolean;
}

export async function addEvidence(userId: string, investigationId: string, input: AddEvidenceInput) {
  const inv = await getInvestigationForUser(userId, investigationId);
  if (inv.status === "closed") throw new AppError("CONFLICT", "This investigation is closed. Reopen it to add evidence.");
  if (input.supersedesEvidenceId) {
    const [prev] = await db.select({ id: evidence.id }).from(evidence).where(and(eq(evidence.id, input.supersedesEvidenceId), eq(evidence.investigationId, investigationId)));
    if (!prev) throw notFound("Evidence to supersede");
  }

  let documentId: string | null = null;
  let documentVersionId: string | null = null;
  let text = input.text?.trim() ? input.text.trim().slice(0, 200_000) : null;
  let provenance: typeof evidence.$inferInsert.provenance = "user_supplied";
  let processingNote: string | null = null;
  let pageTexts: string[] | null = null;

  if (input.file) {
    const stored = await storeDocument({
      ownerId: userId,
      upload: input.file,
      title: input.title,
      docType: input.kind === "lease" && input.supersedesEvidenceId ? "lease_revision" : KIND_TO_DOC[input.kind],
      links: { investigationId },
      isDemo: input.isDemo,
    });
    documentId = stored.documentId;
    documentVersionId = stored.versionId;
    if (!text && stored.extraction.text) {
      text = stored.extraction.text;
      pageTexts = stored.extraction.pageTexts;
      provenance =
        stored.extraction.method === "pdf_text"
          ? "pdf_text"
          : stored.extraction.method === "ocr_local"
            ? "ocr_local"
            : stored.extraction.method === "ocr_provider"
              ? "ocr_provider"
              : stored.extraction.method === "llm_vision"
                ? "llm_vision"
                : "user_supplied";
    }
    processingNote = stored.extraction.note;
  }

  const id = newId("ev");
  const needsFetch = input.kind === "listing_url" && !text && Boolean(input.sourceUrl);
  await db.insert(evidence).values({
    id,
    investigationId,
    kind: input.kind,
    title: input.title.slice(0, 160),
    textContent: text,
    documentId,
    documentVersionId,
    sourceUrl: input.sourceUrl ?? null,
    provenance,
    occurredAt: input.occurredAt ?? null,
    supersedesEvidenceId: input.supersedesEvidenceId ?? null,
    processingStatus: text ? "pending" : needsFetch ? "pending" : input.kind === "property_photo" ? "no_text" : "no_text",
    processingNote,
    createdBy: userId,
  });
  void pageTexts;
  await db.update(investigation).set({ status: inv.status === "draft" ? "active" : inv.status, updatedAt: new Date() }).where(eq(investigation.id, investigationId));
  await bumpState(investigationId);
  await logEvent(
    investigationId,
    input.supersedesEvidenceId ? "evidence_revised" : "evidence_added",
    "user",
    input.supersedesEvidenceId
      ? `New version added: “${input.title.slice(0, 80)}”. The previous version is preserved.`
      : `Evidence added: “${input.title.slice(0, 80)}” (${input.kind.replace(/_/g, " ")}).`,
    { evidenceId: id, kind: input.kind },
  );
  return id;
}

/** Deterministic claim extraction for one evidence item (used by agent tools). */
export async function extractAndStoreClaims(investigationId: string, evidenceId: string): Promise<{ created: number; types: ClaimType[] }> {
  const [ev] = await db.select().from(evidence).where(and(eq(evidence.id, evidenceId), eq(evidence.investigationId, investigationId)));
  if (!ev || !ev.textContent) return { created: 0, types: [] };
  const existing = await db.select({ id: claim.id }).from(claim).where(and(eq(claim.evidenceId, evidenceId), eq(claim.extractor, "deterministic")));
  if (existing.length > 0) return { created: 0, types: [] };
  let pageTexts: string[] | null = null;
  if (ev.documentVersionId) {
    const { documentVersion } = await import("../db/schema");
    const [dv] = await db.select({ pageTexts: documentVersion.pageTexts, text: documentVersion.extractedText }).from(documentVersion).where(eq(documentVersion.id, ev.documentVersionId));
    if (dv?.pageTexts && dv.text === ev.textContent) pageTexts = dv.pageTexts;
  }
  const sourceKind = ev.kind === "lease" ? "lease" : ev.kind.startsWith("listing") || ev.kind === "manual_entry" ? "listing" : ev.kind.startsWith("landlord") ? "message" : "other";
  const extracted = extractClaims(ev.textContent, { sourceKind, pageTexts });
  if (extracted.length) {
    await db.insert(claim).values(
      extracted.map((c) => ({
        id: newId("clm"),
        investigationId,
        evidenceId,
        claimType: c.claimType,
        value: c.value.slice(0, 300),
        normalized: c.normalized.slice(0, 300),
        excerpt: c.excerpt.slice(0, 400),
        locator: c.locator,
        extractor: "deterministic" as const,
        extractionConfidence: c.confidence,
        status: "unverified" as const,
      })),
    );
  }
  await db.update(evidence).set({ processingStatus: "processed" }).where(eq(evidence.id, evidenceId));
  return { created: extracted.length, types: [...new Set(extracted.map((c) => c.claimType))] };
}

export async function correctClaim(userId: string, claimId: string, newValue: string, note?: string) {
  const [c] = await db.select().from(claim).where(eq(claim.id, claimId));
  if (!c) throw notFound("Claim");
  await getInvestigationForUser(userId, c.investigationId);
  const value = newValue.trim().slice(0, 300);
  if (!value) throw new AppError("VALIDATION", "Enter a corrected value.");
  let normalized = value.toLowerCase();
  if (["rent", "deposit", "application_fee", "holding_fee", "pet_deposit", "requested_payment"].includes(c.claimType)) {
    const { parseMoneyToCents } = await import("@/lib/money");
    const cents = parseMoneyToCents(value);
    if (cents === null) throw new AppError("VALIDATION", "Enter an amount such as 1600 or $1,600.");
    normalized = String(cents);
  } else if (c.claimType === "address") {
    const { normalizeAddress } = await import("../extraction/normalize");
    normalized = normalizeAddress(value);
  } else if (["bedrooms", "bathrooms"].includes(c.claimType)) {
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n)) throw new AppError("VALIDATION", "Enter a number.");
    normalized = String(n);
  }
  const id = newId("clm");
  await db.insert(claim).values({
    id,
    investigationId: c.investigationId,
    evidenceId: c.evidenceId,
    claimType: c.claimType,
    value,
    normalized,
    excerpt: c.excerpt,
    locator: c.locator,
    extractor: "user",
    extractionConfidence: "high",
    status: "unverified",
    correctsClaimId: c.id,
  });
  await db.update(claim).set({ supersededAt: new Date() }).where(eq(claim.id, c.id));
  await db.insert(claimLink).values({ id: newId("lnk"), investigationId: c.investigationId, fromClaimId: id, toClaimId: c.id, relation: "corrects", explanation: note?.slice(0, 300) ?? "User correction of an extracted value." }).onConflictDoNothing();
  await bumpState(c.investigationId);
  await logEvent(c.investigationId, "claim_corrected", "user", `Corrected ${c.claimType.replace(/_/g, " ")}: “${c.value}” → “${value}”. Original extraction preserved.`, { claimId: id, previousClaimId: c.id });
  return { id, investigationId: c.investigationId };
}

// ── Verification checks ───────────────────────────────────────────────────

export async function upsertCheck(
  investigationId: string,
  checkType: VerificationCheckType,
  patch: {
    status: CheckRecord["status"];
    method?: string | null;
    summary?: string | null;
    performedBy: "user" | "agent" | "provider";
    providerId?: string | null;
    providerMode?: "LIVE" | "DEMO" | "DETERMINISTIC" | "USER" | "NOT_CONFIGURED" | null;
    evidenceIds?: string[];
    details?: Record<string, unknown> | null;
    note?: string;
  },
) {
  const [existing] = await db.select().from(verificationCheck).where(and(eq(verificationCheck.investigationId, investigationId), eq(verificationCheck.checkType, checkType)));
  const now = new Date();
  let id = existing?.id;
  if (existing) {
    await db
      .update(verificationCheck)
      .set({
        status: patch.status,
        method: patch.method ?? existing.method,
        summary: patch.summary ?? existing.summary,
        performedBy: patch.performedBy,
        providerId: patch.providerId ?? existing.providerId,
        providerMode: patch.providerMode ?? existing.providerMode,
        evidenceIds: patch.evidenceIds ?? existing.evidenceIds,
        details: patch.details === undefined ? existing.details : patch.details,
        checkedAt: now,
        updatedAt: now,
      })
      .where(eq(verificationCheck.id, existing.id));
  } else {
    id = newId("chk");
    await db.insert(verificationCheck).values({
      id,
      investigationId,
      checkType,
      status: patch.status,
      method: patch.method ?? null,
      summary: patch.summary ?? null,
      performedBy: patch.performedBy,
      providerId: patch.providerId ?? null,
      providerMode: patch.providerMode ?? null,
      evidenceIds: patch.evidenceIds ?? [],
      details: patch.details ?? null,
      checkedAt: now,
    });
  }
  if (!existing || existing.status !== patch.status || patch.note) {
    await db.insert(verificationHistory).values({ id: newId("vh"), checkId: id!, fromStatus: existing?.status ?? null, toStatus: patch.status, note: patch.note?.slice(0, 500) ?? patch.summary?.slice(0, 500) ?? null, actor: patch.performedBy });
    await bumpState(investigationId);
  }
  return id!;
}

// ── Snapshot ──────────────────────────────────────────────────────────────

export async function latestToolOutput(investigationId: string, tool: string): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ output: toolRun.output })
    .from(toolRun)
    .where(and(eq(toolRun.investigationId, investigationId), eq(toolRun.tool, tool), eq(toolRun.status, "succeeded")))
    .orderBy(desc(toolRun.startedAt))
    .limit(1);
  return row?.output ?? null;
}

export async function loadSnapshot(investigationId: string): Promise<CaseSnapshot> {
  const [claims, evs, checks] = await Promise.all([
    db.select().from(claim).where(eq(claim.investigationId, investigationId)),
    db.select().from(evidence).where(eq(evidence.investigationId, investigationId)),
    db.select().from(verificationCheck).where(eq(verificationCheck.investigationId, investigationId)),
  ]);
  const imageCheck = checks.find((c) => c.checkType === "image_reuse_local");
  const imageMatches = ((imageCheck?.details as { matches?: ImageMatchRecord[] } | null)?.matches ?? []) as ImageMatchRecord[];
  const webCheck = checks.find((c) => c.checkType === "image_reuse_web");
  const webMatches = ((webCheck?.details as { matches?: ImageMatchRecord[] } | null)?.matches ?? []) as ImageMatchRecord[];
  const comparison = await latestToolOutput(investigationId, "rental_comparison");
  return {
    investigationId,
    claims: claims.map((c) => ({
      id: c.id,
      evidenceId: c.evidenceId,
      claimType: c.claimType,
      value: c.value,
      normalized: c.normalized,
      excerpt: c.excerpt,
      locator: c.locator,
      extractor: c.extractor,
      status: c.status,
      supersededAt: c.supersededAt,
      extractedAt: c.extractedAt,
    })),
    evidence: evs.map((e) => ({ id: e.id, kind: e.kind, title: e.title, createdAt: e.createdAt, occurredAt: e.occurredAt, supersedesEvidenceId: e.supersedesEvidenceId, sourceUrl: e.sourceUrl })),
    checks: checks.map((c) => ({ checkType: c.checkType, status: c.status, summary: c.summary, providerMode: c.providerMode })),
    imageMatches: [...imageMatches, ...webMatches],
    rentContext: (comparison?.rentContext as RentContext | undefined) ?? null,
  };
}

// ── Persisting an evaluation ──────────────────────────────────────────────

export async function persistEvaluation(
  investigationId: string,
  drafts: FindingDraft[],
  links: LinkDraft[],
  contradictedClaimIds: Set<string>,
  runId: string | null,
): Promise<{ created: string[]; resolved: string[]; reactivated: string[] }> {
  const existing = await db.select().from(finding).where(eq(finding.investigationId, investigationId));
  const byKey = new Map(existing.map((f) => [f.findingKey, f]));
  const now = new Date();
  const created: string[] = [];
  const resolved: string[] = [];
  const reactivated: string[] = [];
  const newKeys = new Set(drafts.map((d) => d.key));

  for (const d of drafts) {
    const prev = byKey.get(d.key);
    const values = {
      category: d.category,
      label: d.label,
      severity: d.severity,
      title: d.title.slice(0, 200),
      explanation: d.explanation.slice(0, 3000),
      recommendation: d.recommendation?.slice(0, 600) ?? null,
      ruleKey: d.ruleKey ?? null,
      ruleVersion: d.ruleVersion ?? null,
      citationLabel: d.citationLabel ?? null,
      citationUrl: d.citationUrl ?? null,
      claimIds: d.claimIds,
      evidenceIds: d.evidenceIds,
      requiresHumanReview: d.requiresHumanReview,
      lastEvaluatedAt: now,
    };
    if (!prev) {
      await db.insert(finding).values({
        id: newId("fnd"),
        investigationId,
        findingKey: d.key,
        ...values,
        humanReview: d.requiresHumanReview ? "pending" : "not_required",
        detectedByRunId: runId,
        firstDetectedAt: now,
      });
      created.push(d.key);
    } else {
      const reopening = prev.lifecycle === "resolved";
      await db
        .update(finding)
        .set({
          ...values,
          ...(reopening ? { lifecycle: "active" as const, resolvedAt: null, resolutionNote: null } : {}),
          ...(prev.humanReview === "not_required" && d.requiresHumanReview ? { humanReview: "pending" as const } : {}),
        })
        .where(eq(finding.id, prev.id));
      if (reopening) reactivated.push(d.key);
    }
  }

  // Findings no longer produced → resolved (never deleted).
  const evRows = await db.select({ id: evidence.id, title: evidence.title, supersedes: evidence.supersedesEvidenceId }).from(evidence).where(eq(evidence.investigationId, investigationId));
  const supersededBy = new Map(evRows.filter((e) => e.supersedes).map((e) => [e.supersedes!, e.title]));
  for (const f of existing) {
    if (f.lifecycle !== "active" || newKeys.has(f.findingKey)) continue;
    const revised = f.evidenceIds.map((id) => supersededBy.get(id)).find(Boolean);
    const note = revised
      ? `No longer detected after the revised document “${revised}” was added. The earlier evidence is preserved.`
      : "No longer detected when the case was re-evaluated with the current evidence.";
    await db.update(finding).set({ lifecycle: "resolved", resolvedAt: now, resolutionNote: note, lastEvaluatedAt: now }).where(eq(finding.id, f.id));
    resolved.push(f.findingKey);
  }

  // Claim links (idempotent) and claim statuses
  for (const l of links) {
    await db.insert(claimLink).values({ id: newId("lnk"), investigationId, ...l }).onConflictDoNothing();
  }
  const allClaims = await db.select({ id: claim.id, status: claim.status }).from(claim).where(eq(claim.investigationId, investigationId));
  for (const c of allClaims) {
    const next = contradictedClaimIds.has(c.id) ? "contradicted" : c.status === "contradicted" ? "unverified" : c.status;
    await db.update(claim).set({ status: next, lastCheckedAt: now }).where(eq(claim.id, c.id));
  }

  for (const key of created) {
    const d = drafts.find((x) => x.key === key)!;
    await logEvent(investigationId, "finding_detected", "agent", `${d.severity === "serious" ? "Serious concern" : d.category === "verification_gap" ? "Open question" : "Finding"}: ${d.title}`, { findingKey: key, severity: d.severity });
  }
  for (const key of resolved) {
    const f = existing.find((x) => x.findingKey === key)!;
    await logEvent(investigationId, "finding_resolved", "agent", `Resolved: ${f.title}`, { findingKey: key });
  }
  for (const key of reactivated) {
    await logEvent(investigationId, "finding_reopened", "agent", `Reopened: ${drafts.find((d) => d.key === key)?.title ?? key}`, { findingKey: key });
  }

  if (created.some((k) => drafts.find((d) => d.key === k)?.severity === "serious")) {
    const [inv] = await db.select({ ownerId: investigation.ownerId, title: investigation.title }).from(investigation).where(eq(investigation.id, investigationId));
    if (inv) {
      await notify(inv.ownerId, {
        category: "case",
        title: "New serious concern in your investigation",
        body: `“${inv.title}” has a new serious finding. Review it before paying anything.`,
        link: `/investigations/${investigationId}`,
        dedupeKey: `serious:${investigationId}:${created.sort().join(",")}`.slice(0, 250),
      });
    }
  }
  return { created, resolved, reactivated };
}

// ── Human review and actions ──────────────────────────────────────────────

export async function reviewFinding(userId: string, findingId: string, decision: "confirmed" | "disputed" | "dismissed" | "reopen", note?: string) {
  const [f] = await db.select().from(finding).where(eq(finding.id, findingId));
  if (!f) throw notFound("Finding");
  await getInvestigationForUser(userId, f.investigationId);
  if (decision === "dismissed") {
    await db.update(finding).set({ lifecycle: "dismissed", resolutionNote: note?.slice(0, 500) ?? "Dismissed by the renter." }).where(eq(finding.id, findingId));
  } else if (decision === "reopen") {
    await db.update(finding).set({ lifecycle: "active", resolutionNote: null, resolvedAt: null }).where(eq(finding.id, findingId));
  } else {
    await db.update(finding).set({ humanReview: decision, humanReviewNote: note?.slice(0, 500) ?? null }).where(eq(finding.id, findingId));
  }
  await logEvent(f.investigationId, "finding_reviewed", "user", `${decision === "confirmed" ? "Confirmed" : decision === "disputed" ? "Disputed" : decision === "dismissed" ? "Dismissed" : "Reopened"}: ${f.title}${note ? ` — “${note.slice(0, 120)}”` : ""}`);
}

export async function proposeAction(
  investigationId: string,
  input: { key: string; type: (typeof investigationAction.$inferInsert)["actionType"]; title: string; description: string; messageDraftId?: string | null; runId?: string | null },
): Promise<boolean> {
  const res = await db
    .insert(investigationAction)
    .values({
      id: newId("act"),
      investigationId,
      actionKey: input.key,
      actionType: input.type,
      title: input.title,
      description: input.description,
      messageDraftId: input.messageDraftId ?? null,
      proposedByRunId: input.runId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: investigationAction.id });
  return res.length > 0;
}

export async function setActionStatus(userId: string, actionId: string, status: "approved" | "dismissed" | "completed_by_user", note?: string) {
  const [a] = await db.select().from(investigationAction).where(eq(investigationAction.id, actionId));
  if (!a) throw notFound("Action");
  await getInvestigationForUser(userId, a.investigationId);
  await db
    .update(investigationAction)
    .set({ status, verificationNote: note?.slice(0, 500) ?? a.verificationNote, updatedAt: new Date(), completedAt: status === "completed_by_user" ? new Date() : null })
    .where(eq(investigationAction.id, actionId));
  await logEvent(a.investigationId, "action_updated", "user", `Action “${a.title}” marked ${status.replace(/_/g, " ")}.`);
}

export async function latestRun(investigationId: string) {
  const [r] = await db.select().from(agentRun).where(eq(agentRun.investigationId, investigationId)).orderBy(desc(agentRun.startedAt)).limit(1);
  return r ?? null;
}
