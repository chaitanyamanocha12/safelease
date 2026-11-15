/**
 * Verification gaps and unknowns: what has NOT been established.
 * These keep uncertainty visible so "no warnings" never reads as "safe".
 */
import { activeClaims, byType } from "./active";
import type { CaseSnapshot, CheckRecord, FindingDraft } from "./types";

export const AUTHORITY_UNVERIFIED = "Rental authority has not been independently verified.";

function check(s: CaseSnapshot, type: CheckRecord["checkType"]): CheckRecord | undefined {
  return s.checks.find((c) => c.checkType === type);
}

export function assessGaps(s: CaseSnapshot): FindingDraft[] {
  const claims = activeClaims(s);
  const out: FindingDraft[] = [];
  const gap = (
    key: string,
    title: string,
    explanation: string,
    recommendation: string,
    label: FindingDraft["label"] = "unverified",
    severity: FindingDraft["severity"] = "caution",
    category: FindingDraft["category"] = "verification_gap",
  ) => out.push({ key, category, label, severity, title, explanation, recommendation, claimIds: [], evidenceIds: [], requiresHumanReview: false });

  const authority = check(s, "rental_authority");
  if (authority?.status !== "supported") {
    gap(
      "gap:rental_authority",
      AUTHORITY_UNVERIFIED,
      authority?.status === "contradicted"
        ? `Evidence reviewed contradicts the advertiser's authority: ${authority.summary ?? "see verification history"}.`
        : "SafeLease has not confirmed that the person you're dealing with is the owner or is authorized to lease this unit. Registered ownership (where available) would still not prove that the person messaging you has authority. Nova Scotia's property registry requires paid, authorized access that SafeLease does not have.",
      "Confirm through an independently found channel — e.g., call a property-management company using contact details from its own website, or ask for documentation you can check with the issuer.",
      authority?.status === "contradicted" ? "contradicted" : "unverified",
      authority?.status === "contradicted" ? "serious" : "caution",
    );
  }

  const viewing = check(s, "viewing_confirmed");
  if (viewing?.status !== "supported") {
    gap(
      "gap:viewing",
      "No independent viewing recorded",
      "No in-person or verified live viewing of this unit is recorded. A viewing confirms the unit exists and matches the advertisement; it does not on its own confirm the person's authority to rent it.",
      "Record a viewing in the Verification tab once it happens.",
    );
  }

  if (byType(claims, "address").length > 0) {
    const addr = check(s, "address_validity");
    if (!addr || addr.status === "not_started") {
      gap("gap:address_not_checked", "Address has not been checked", "The advertised address has not been checked against an address provider.", "Run the investigation to check the address, or confirm it during a viewing.", "not_checked", "info");
    } else if (addr.status === "provider_unavailable") {
      gap(
        "gap:address_provider_unavailable",
        "Address check unavailable",
        `An address check could not be performed: ${addr.summary ?? "no geocoding provider is configured"}. This is not evidence for or against the listing.`,
        "Confirm the address during a viewing or with the municipality.",
        "provider_unavailable",
        "info",
      );
    } else if (addr.status === "contradicted") {
      gap("gap:address_not_found", "Address could not be matched", addr.summary ?? "The address provider did not find this address.", "Ask for the exact civic address and unit number.", "contradicted", "caution");
    }
  }

  // Unknown core facts
  const unknown = (key: string, title: string, rec: string) =>
    gap(`unknown:${key}`, title, "This information is not present in the evidence collected so far. SafeLease does not guess missing terms.", rec, "unverified", "info", "unknown");
  if (byType(claims, "rent").length === 0) unknown("rent", "Monthly rent not stated", "Ask for the monthly rent and what it includes.");
  if (byType(claims, "address").length === 0) unknown("address", "Unit address not stated", "Ask for the full civic address and unit number.");
  if (byType(claims, "deposit").length === 0 && byType(claims, "requested_payment").length > 0)
    unknown("deposit_purpose", "Purpose of requested payment unclear", "Ask what the requested payment is for and get it in writing.");
  if (!s.evidence.some((e) => e.kind === "lease")) unknown("lease", "No lease reviewed yet", "Ask for the lease before paying. Nova Scotia's Standard Form of Lease conditions apply to every residential lease.");

  return out;
}
