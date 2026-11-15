/** Lease review service: versions, analysis, clause storage, case linkage. */
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { claim, lease, leaseClause, leaseVersion } from "../db/schema";
import { newId } from "@/lib/ids";
import { AppError, notFound } from "../errors";
import type { ValidatedUpload } from "../security/upload";
import { storeDocument } from "./documents";
import { analyzeLease, diffTerms, type LeaseAnalysis, type LeaseTerms } from "../leases/analyze";
import { addEvidence, getInvestigationForUser } from "./investigations";

async function listingTermsFor(investigationId: string | null) {
  if (!investigationId) return null;
  const { evidence } = await import("../db/schema");
  const rows = await db
    .select({ type: claim.claimType, normalized: claim.normalized, kind: evidence.kind })
    .from(claim)
    .innerJoin(evidence, eq(evidence.id, claim.evidenceId))
    .where(eq(claim.investigationId, investigationId));
  const listing = rows.filter((r) => r.kind.startsWith("listing") || r.kind === "manual_entry");
  const rent = listing.find((r) => r.type === "rent");
  const dep = listing.find((r) => r.type === "deposit");
  const util = listing.filter((r) => r.type === "utilities" && r.normalized.startsWith("included:")).flatMap((r) => r.normalized.split(":")[1]!.split(","));
  return { rentCents: rent ? Number(rent.normalized) : null, depositCents: dep ? Number(dep.normalized) : null, utilitiesIncluded: util };
}

async function storeVersion(ownerId: string, leaseId: string, version: number, investigationId: string | null, input: { text?: string | null; file?: ValidatedUpload | null }) {
  let text = input.text?.trim() ?? "";
  let pageTexts: string[] | null = null;
  let documentId: string | null = null;
  let documentVersionId: string | null = null;
  let status: "succeeded" | "partial" | "failed" = "succeeded";
  if (input.file) {
    const stored = await storeDocument({ ownerId, upload: input.file, title: `Lease v${version}`, docType: version > 1 ? "lease_revision" : "lease", links: { investigationId } });
    documentId = stored.documentId;
    documentVersionId = stored.versionId;
    if (!text) {
      text = stored.extraction.text ?? "";
      pageTexts = stored.extraction.pageTexts;
      status = stored.extraction.status === "succeeded" ? "succeeded" : stored.extraction.text ? "partial" : "failed";
    }
  }
  if (!text) throw new AppError("VALIDATION", "Paste the lease text or upload a readable lease file.");
  const analysis = analyzeLease(text, pageTexts, await listingTermsFor(investigationId));
  const versionId = newId("lv");
  let evidenceId: string | null = null;
  if (investigationId) {
    const { evidence } = await import("../db/schema");
    const prior = await db.select({ id: evidence.id }).from(evidence).where(and(eq(evidence.investigationId, investigationId), eq(evidence.kind, "lease"))).orderBy(desc(evidence.createdAt)).limit(1);
    evidenceId = await addEvidence(ownerId, investigationId, { kind: "lease", title: `Lease v${version} (from Lease review)`, text, supersedesEvidenceId: version > 1 ? prior[0]?.id ?? null : null });
  }
  await db.insert(leaseVersion).values({ id: versionId, leaseId, version, documentId, documentVersionId, evidenceId, textContent: text, pageTexts, extractionStatus: status, terms: analysis.terms as unknown as Record<string, unknown>, analysis: analysis as unknown as Record<string, unknown>, analyzedAt: new Date() });
  if (analysis.clauses.length) {
    await db.insert(leaseClause).values(analysis.clauses.map((c) => ({ id: newId("lc"), leaseVersionId: versionId, ...c })));
  }
  await db.update(lease).set({ updatedAt: new Date() }).where(eq(lease.id, leaseId));
  return { versionId, analysis };
}

export async function createLeaseReview(ownerId: string, input: { title: string; investigationId?: string | null; text?: string | null; file?: ValidatedUpload | null; isDemo?: boolean }) {
  if (input.investigationId) await getInvestigationForUser(ownerId, input.investigationId);
  const id = newId("lse");
  await db.insert(lease).values({ id, ownerId, title: input.title.slice(0, 140), investigationId: input.investigationId ?? null, isDemo: input.isDemo ?? false });
  try {
    await storeVersion(ownerId, id, 1, input.investigationId ?? null, input);
  } catch (e) {
    await db.delete(lease).where(eq(lease.id, id));
    throw e;
  }
  return id;
}

export async function addLeaseVersion(ownerId: string, leaseId: string, input: { text?: string | null; file?: ValidatedUpload | null }) {
  const l = await getOwnedLease(ownerId, leaseId);
  const versions = await db.select({ v: leaseVersion.version }).from(leaseVersion).where(eq(leaseVersion.leaseId, leaseId));
  const next = Math.max(0, ...versions.map((v) => v.v)) + 1;
  return storeVersion(ownerId, leaseId, next, l.investigationId, input);
}

export async function getOwnedLease(ownerId: string, id: string) {
  const [l] = await db.select().from(lease).where(and(eq(lease.id, id), eq(lease.ownerId, ownerId)));
  if (!l) throw notFound("Lease review");
  return l;
}

export async function getLeaseReview(ownerId: string, id: string) {
  const l = await getOwnedLease(ownerId, id);
  const versions = await db.select().from(leaseVersion).where(eq(leaseVersion.leaseId, id)).orderBy(asc(leaseVersion.version));
  const latest = versions.at(-1)!;
  const previous = versions.length > 1 ? versions.at(-2)! : null;
  const clauses = await db.select().from(leaseClause).where(eq(leaseClause.leaseVersionId, latest.id)).orderBy(asc(leaseClause.startOffset));
  const analysis = latest.analysis as unknown as LeaseAnalysis;
  const diff = previous ? diffTerms(previous.terms as unknown as LeaseTerms, latest.terms as unknown as LeaseTerms) : [];
  return { lease: l, versions, latest, clauses, analysis, diff };
}

export async function listLeaseReviews(ownerId: string) {
  return db.select().from(lease).where(eq(lease.ownerId, ownerId)).orderBy(desc(lease.updatedAt));
}

export async function deleteLeaseReview(ownerId: string, id: string) {
  await getOwnedLease(ownerId, id);
  await db.delete(lease).where(eq(lease.id, id));
}
