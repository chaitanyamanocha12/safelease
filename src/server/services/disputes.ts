/**
 * Dispute evidence package builder. Assembles user records into a reviewable
 * package. Never files a claim and never predicts an outcome.
 */
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/client";
import { disputeCase, document, finding, investigation, investigationEvent } from "../db/schema";
import { newId } from "@/lib/ids";
import { notFound } from "../errors";
import { formatCents } from "@/lib/money";
import { LEGAL_SOURCES, RULE_BY_KEY, SOURCE_BY_KEY } from "../legal/catalog";
import { depositStatusSummary, getDeposit, getMaintenanceCase, getTenancy, analyzeMaintenance, compareInspections } from "./tenancy";
import { inspection, inspectionItem } from "../db/schema";

export type DisputeType = (typeof disputeCase.$inferInsert)["disputeType"];

export interface DisputePackage {
  summary: string;
  timeline: Array<{ date: string; event: string; source: string }>;
  documents: Array<{ id: string; title: string; type: string; uploaded: string }>;
  evidence: Array<{ id: string; label: string; detail: string }>;
  sources: Array<{ title: string; url: string; why: string }>;
  questionsForLegalAdvice: string[];
  outstandingFacts: string[];
  generatedAt: string;
}

const TYPE_SOURCES: Record<DisputeType, string[]> = {
  deposit: ["NS-DEPOSIT-RETURN", "NS-DEPOSIT-MAX", "NS-CONDITION-REPORT"],
  maintenance: ["NS-STANDARD-FORM", "NS-ENTRY-NOTICE"],
  unexpected_fee: ["NS-APPLICATION-FEE", "NS-DEPOSIT-DEEMED", "NS-LATE-FEE"],
  lease_discrepancy: ["NS-STANDARD-FORM", "NS-LEASE-COPY", "NS-LEASE-TYPES"],
  rent_increase: ["NS-RENT-CAP", "NS-RENT-INCREASE-NOTICE"],
  misrepresentation: ["NS-STANDARD-FORM", "NS-DEPOSIT-DEEMED"],
};

const QUESTIONS: Record<DisputeType, string[]> = {
  deposit: ["Do the claimed deductions go beyond ordinary wear and tear?", "Was a security deposit claim filed with the Director within 10 days of the tenancy ending?", "Is interest owed on the deposit for the period it was held?"],
  maintenance: ["Does the condition affect health, safety or fitness for habitation?", "Is an emergency hearing (Form DR9) appropriate?", "Am I entitled to any rent abatement for the period affected?"],
  unexpected_fee: ["Is this fee permitted, or is it effectively a deposit or a prohibited application fee?", "How can I recover a fee that I've already paid?"],
  lease_discrepancy: ["Which terms apply when the lease conflicts with the advertisement or the Standard Form of Lease?", "Can I end the lease if material terms were misrepresented?"],
  rent_increase: ["Does the 5% cap apply to my situation (existing tenant, same unit)?", "Was proper written notice given for my lease type?"],
  misrepresentation: ["Should this be reported to police or Nova Scotia consumer protection?", "Can money paid be recovered, and how?"],
};

export async function createDispute(ownerId: string, input: { disputeType: DisputeType; title: string; investigationId?: string | null; tenancyId?: string | null; maintenanceCaseId?: string | null; depositId?: string | null; isDemo?: boolean }) {
  const id = newId("dsp");
  await db.insert(disputeCase).values({ id, ownerId, ...input, title: input.title.slice(0, 140) });
  await buildPackage(ownerId, id);
  return id;
}

export async function getDispute(ownerId: string, id: string) {
  const [d] = await db.select().from(disputeCase).where(and(eq(disputeCase.id, id), eq(disputeCase.ownerId, ownerId)));
  if (!d) throw notFound("Dispute");
  return d;
}

export async function listDisputes(ownerId: string) {
  return db.select().from(disputeCase).where(eq(disputeCase.ownerId, ownerId)).orderBy(desc(disputeCase.updatedAt));
}

export async function buildPackage(ownerId: string, id: string): Promise<DisputePackage> {
  const d = await getDispute(ownerId, id);
  const timeline: DisputePackage["timeline"] = [];
  const evidenceItems: DisputePackage["evidence"] = [];
  const outstanding: string[] = [];
  const parts: string[] = [];

  if (d.tenancyId) {
    const t = await getTenancy(ownerId, d.tenancyId);
    parts.push(`Tenancy: ${t.label}${t.address ? ` at ${t.address}` : ""}${t.startDate ? `, started ${t.startDate}` : ""}${t.endDate ? `, ended ${t.endDate}` : ""}.`);
    if (t.startDate) timeline.push({ date: t.startDate, event: "Tenancy started", source: "Tenancy record" });
    const insps = await db.select().from(inspection).where(eq(inspection.tenancyId, t.id));
    const mi = insps.find((i) => i.kind === "move_in");
    const mo = insps.find((i) => i.kind === "move_out");
    if (mi) {
      const items = await db.select().from(inspectionItem).where(eq(inspectionItem.inspectionId, mi.id));
      timeline.push({ date: mi.inspectedOn ?? mi.createdAt.toISOString().slice(0, 10), event: `Move-in inspection recorded (${items.length} items, ${items.filter((x) => x.preExisting).length} pre-existing issues)`, source: "Inspection" });
      for (const it of items.filter((x) => x.preExisting)) evidenceItems.push({ id: `item:${it.id}`, label: `Pre-existing at move-in: ${it.itemName} (${it.room.replace("_", " ")})`, detail: `${it.condition}${it.description ? ` — ${it.description}` : ""}` });
      if (mo) {
        const outItems = await db.select().from(inspectionItem).where(eq(inspectionItem.inspectionId, mo.id));
        for (const r of compareInspections(items, outItems).filter((x) => x.change === "worse")) evidenceItems.push({ id: `cmp:${r.room}:${r.itemName}`, label: `Condition changed: ${r.itemName}`, detail: `${r.moveIn} at move-in → ${r.moveOut} at move-out${r.preExisting ? " (noted as pre-existing)" : ""}` });
      } else if (d.disputeType === "deposit") outstanding.push("No move-out inspection recorded.");
      if (!mi.officialFormCompleted) outstanding.push("Whether the official Rental Unit Condition Report was completed and signed at move-in.");
    } else if (d.disputeType === "deposit") outstanding.push("No move-in inspection recorded — evidence of the unit's starting condition is limited.");
  }

  if (d.depositId) {
    const { deposit, events } = await getDeposit(ownerId, d.depositId);
    const s = depositStatusSummary(deposit, events);
    parts.push(`Deposit of ${formatCents(deposit.amountCents)}${deposit.paidOn ? ` paid ${deposit.paidOn}` : ""}; ${formatCents(deposit.amountReturnedCents ?? 0)} returned so far; ${formatCents(s.disputedCents)} in disputed deductions.`);
    for (const e of events) timeline.push({ date: e.occurredOn, event: `${e.description}${e.amountCents ? ` (${formatCents(e.amountCents)})` : ""}`, source: "Deposit record" });
    if (s.deadline) evidenceItems.push({ id: "deposit:deadline", label: "Deposit return / claim deadline", detail: `${s.deadline} (10 days after the tenancy ended on ${deposit.tenancyEndedOn})` });
    if (s.exceededLimit) evidenceItems.push({ id: "deposit:limit", label: "Deposit exceeded half-month limit", detail: `Maximum would have been ${formatCents(s.exceededLimit.maxAllowed)}` });
    if (!events.some((e) => e.eventType === "receipt_uploaded")) outstanding.push("Proof of deposit payment (receipt or bank record).");
    if (!deposit.tenancyEndedOn) outstanding.push("The date the tenancy ended.");
  }

  if (d.maintenanceCaseId) {
    const { case: c, events } = await getMaintenanceCase(ownerId, d.maintenanceCaseId);
    const a = analyzeMaintenance(c, events);
    parts.push(`Maintenance issue: ${c.title} (${c.status.replace(/_/g, " ")}).`);
    for (const e of events) timeline.push({ date: e.occurredOn, event: `${e.eventType.replace(/_/g, " ")}: ${e.description}`, source: "Maintenance log" });
    a.conflicts.forEach((x, i) => evidenceItems.push({ id: `mc:${i}`, label: "Conflicting promises", detail: x }));
    a.flags.forEach((x, i) => evidenceItems.push({ id: `mf:${i}`, label: "Observation", detail: x.text }));
    outstanding.push(...a.missing);
  }

  if (d.investigationId) {
    const [inv] = await db.select().from(investigation).where(and(eq(investigation.id, d.investigationId), eq(investigation.ownerId, ownerId)));
    if (inv) {
      parts.push(`Related investigation: ${inv.title}.`);
      const fs = await db.select().from(finding).where(and(eq(finding.investigationId, inv.id), eq(finding.lifecycle, "active")));
      for (const f of fs.filter((x) => x.severity !== "info")) evidenceItems.push({ id: `finding:${f.id}`, label: f.title, detail: f.explanation.slice(0, 400) });
      const evs = await db.select().from(investigationEvent).where(eq(investigationEvent.investigationId, inv.id)).orderBy(investigationEvent.createdAt);
      for (const e of evs.filter((x) => ["evidence_added", "evidence_revised", "message_sent_by_user", "message_submitted"].includes(x.eventType))) timeline.push({ date: e.createdAt.toISOString().slice(0, 10), event: e.message, source: "Investigation" });
    }
  }

  const linkConds = [d.tenancyId ? eq(document.tenancyId, d.tenancyId) : null, d.maintenanceCaseId ? eq(document.maintenanceCaseId, d.maintenanceCaseId) : null, d.depositId ? eq(document.depositId, d.depositId) : null, d.investigationId ? eq(document.investigationId, d.investigationId) : null, eq(document.disputeId, d.id)].filter(Boolean) as ReturnType<typeof eq>[];
  const docs = await db.select().from(document).where(and(eq(document.ownerId, ownerId), or(...linkConds)));
  const excluded = new Set(d.excludedItemIds);
  const ruleKeys = TYPE_SOURCES[d.disputeType];
  const sources = ruleKeys.map((k) => {
    const r = RULE_BY_KEY.get(k)!;
    return { title: `${r.title} — ${r.citation}`, url: SOURCE_BY_KEY.get(r.sourceKey)!.url, why: r.summary };
  });
  sources.push({ title: "Residential tenancy forms (Form J, Form S, Form DR9)", url: LEGAL_SOURCES.find((s) => s.sourceKey === "NS-FORMS")!.url, why: "Official forms to apply to the Director of Residential Tenancies." });

  const pkg: DisputePackage = {
    summary: d.summary ?? (parts.join(" ") || "Describe what happened in your own words."),
    timeline: timeline.sort((a, b) => a.date.localeCompare(b.date)).filter((t) => !excluded.has(`t:${t.date}:${t.event}`)),
    documents: docs.filter((x) => !excluded.has(`doc:${x.id}`)).map((x) => ({ id: x.id, title: x.title, type: x.docType, uploaded: x.createdAt.toISOString().slice(0, 10) })),
    evidence: evidenceItems.filter((e) => !excluded.has(e.id)),
    sources,
    questionsForLegalAdvice: QUESTIONS[d.disputeType],
    outstandingFacts: [...new Set(outstanding)],
    generatedAt: new Date().toISOString(),
  };
  await db.update(disputeCase).set({ package: pkg as unknown as Record<string, unknown>, outstandingFacts: pkg.outstandingFacts, updatedAt: new Date() }).where(eq(disputeCase.id, id));
  return pkg;
}

export async function updateDispute(ownerId: string, id: string, patch: { summary?: string | null; status?: "drafting" | "ready_for_review" | "archived"; excludeItemId?: string; includeItemId?: string; title?: string }) {
  const d = await getDispute(ownerId, id);
  const excluded = new Set(d.excludedItemIds);
  if (patch.excludeItemId) excluded.add(patch.excludeItemId);
  if (patch.includeItemId) excluded.delete(patch.includeItemId);
  await db
    .update(disputeCase)
    .set({ ...(patch.summary !== undefined ? { summary: patch.summary?.slice(0, 6000) ?? null } : {}), ...(patch.status ? { status: patch.status } : {}), ...(patch.title ? { title: patch.title.slice(0, 140) } : {}), excludedItemIds: [...excluded], updatedAt: new Date() })
    .where(eq(disputeCase.id, id));
  return buildPackage(ownerId, id);
}

export async function deleteDispute(ownerId: string, id: string) {
  await getDispute(ownerId, id);
  await db.delete(disputeCase).where(eq(disputeCase.id, id));
}

void inArray;
