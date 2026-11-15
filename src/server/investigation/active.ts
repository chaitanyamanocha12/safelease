import type { CaseSnapshot, ClaimRecord, EvidenceRecord } from "./types";
import type { ClaimType } from "../db/schema/investigations";

/** Evidence ids that a newer evidence item explicitly supersedes. */
export function supersededEvidenceIds(evidence: EvidenceRecord[]): Set<string> {
  return new Set(evidence.map((e) => e.supersedesEvidenceId).filter((x): x is string => Boolean(x)));
}

/** Claims that are current: not corrected/superseded and not from superseded evidence. */
export function activeClaims(s: CaseSnapshot): ClaimRecord[] {
  const superseded = supersededEvidenceIds(s.evidence);
  return s.claims.filter((c) => !c.supersededAt && !superseded.has(c.evidenceId));
}

export function byType(claims: ClaimRecord[], type: ClaimType): ClaimRecord[] {
  return claims.filter((c) => c.claimType === type);
}

export function evidenceMap(s: CaseSnapshot): Map<string, EvidenceRecord> {
  return new Map(s.evidence.map((e) => [e.id, e]));
}

export function evidenceLabel(e: EvidenceRecord | undefined): string {
  if (!e) return "unknown source";
  const kind: Record<string, string> = {
    listing_text: "listing",
    listing_url: "listing page",
    listing_screenshot: "listing screenshot",
    property_photo: "photo",
    pdf_document: "document",
    landlord_message: "landlord message",
    landlord_response: "landlord response",
    lease: "lease",
    supporting_document: "supporting document",
    manual_entry: "manual entry",
    viewing_note: "viewing note",
  };
  return `${kind[e.kind] ?? e.kind} “${e.title}”`;
}

export function isLeaseEvidence(e: EvidenceRecord | undefined): boolean {
  return e?.kind === "lease";
}

export function isListingEvidence(e: EvidenceRecord | undefined): boolean {
  return e?.kind === "listing_text" || e?.kind === "listing_url" || e?.kind === "listing_screenshot" || e?.kind === "manual_entry";
}

export function isMessageEvidence(e: EvidenceRecord | undefined): boolean {
  return e?.kind === "landlord_message" || e?.kind === "landlord_response";
}

export function centsOf(c: ClaimRecord): number | null {
  const n = Number.parseInt(c.normalized, 10);
  return Number.isFinite(n) && /^\d+$/.test(c.normalized) ? n : null;
}

/** Order for "time" comparisons: occurredAt if known, else createdAt. */
export function evidenceTime(e: EvidenceRecord | undefined): number {
  if (!e) return 0;
  return (e.occurredAt ?? e.createdAt).getTime();
}
