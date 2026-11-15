/**
 * Applies deterministic NS rules to the facts extracted in an investigation.
 * Facts are user-supplied or advertiser statements — explanations say
 * "if these amounts are accurate" rather than asserting them as true.
 */
import { formatCents } from "@/lib/money";
import type { RuleMeta, LegalCheckResult } from "../legal/rules";
import {
  checkApplicationFee,
  checkDepositMax,
  checkPetDeposit,
  checkSinRequest,
  checkUpfrontDeemedDeposit,
  checkLateFee,
  checkEntryNotice,
  maxDepositCents,
} from "../legal/rules";
import { activeClaims, byType, centsOf, evidenceMap, isLeaseEvidence } from "./active";
import type { CaseSnapshot, ClaimRecord, FindingDraft } from "./types";

export type RuleLookup = (ruleKey: string) => RuleMeta | null;

function toFinding(r: LegalCheckResult, claims: ClaimRecord[], extra?: Partial<FindingDraft>): FindingDraft | null {
  if (r.outcome === "not_applicable" || r.outcome === "compliant" || r.outcome === "insufficient_facts") return null;
  const serious = r.outcome === "clear_violation";
  return {
    key: `legal:${r.ruleKey}`,
    category: "legal",
    label: r.needsReview ? "needs_review" : "warning",
    severity: serious ? "serious" : r.outcome === "guidance" ? "info" : "caution",
    title: serious ? `Rule concern: ${r.title}` : r.title,
    explanation: r.explanation + (r.needsReview ? " This rule version is awaiting review by an administrator." : ""),
    recommendation: undefined,
    ruleKey: r.ruleKey,
    ruleVersion: r.ruleVersion,
    citationLabel: r.citation,
    citationUrl: r.sourceUrl,
    claimIds: claims.map((c) => c.id),
    evidenceIds: [...new Set(claims.map((c) => c.evidenceId))],
    requiresHumanReview: r.needsReview,
    ...extra,
  };
}

export interface LegalApplication {
  findings: FindingDraft[];
  results: LegalCheckResult[];
  /** The rent basis used for calculations, with its provenance. */
  rentBasis: { cents: number; claimId: string; note: string } | null;
}

export function applyLegalRules(s: CaseSnapshot, rule: RuleLookup): LegalApplication {
  const claims = activeClaims(s);
  const ev = evidenceMap(s);
  const findings: FindingDraft[] = [];
  const results: LegalCheckResult[] = [];

  const rentClaims = byType(claims, "rent").filter((c) => centsOf(c) !== null);
  // Use the HIGHEST stated rent as the deposit basis — the most permissive
  // reading for the landlord — so a deposit concern holds under every reading.
  const sortedRents = [...rentClaims].sort((a, b) => centsOf(b)! - centsOf(a)!);
  const rentBasisClaim = sortedRents[0];
  const distinctRents = [...new Set(rentClaims.map((c) => centsOf(c)!))];
  const rentBasis = rentBasisClaim
    ? {
        cents: centsOf(rentBasisClaim)!,
        claimId: rentBasisClaim.id,
        note:
          distinctRents.length > 1
            ? `Sources state different rents (${distinctRents.map((x) => formatCents(x)).join(", ")}); the highest (${formatCents(centsOf(rentBasisClaim)!)}) is used so the check holds under every stated amount.`
            : `Based on the stated rent of ${formatCents(centsOf(rentBasisClaim)!)}.`,
      }
    : null;

  const depositClaims = byType(claims, "deposit").filter((c) => centsOf(c) !== null);
  const maxDepositClaim = [...depositClaims].sort((a, b) => centsOf(b)! - centsOf(a)!)[0];

  const depositRule = rule("NS-DEPOSIT-MAX");
  if (depositRule && maxDepositClaim) {
    const r = checkDepositMax(depositRule, { monthlyRentCents: rentBasis?.cents, depositCents: centsOf(maxDepositClaim) });
    results.push(r);
    const fd = toFinding(r, [maxDepositClaim, ...(rentBasisClaim ? [rentBasisClaim] : [])], {
      explanation: `${r.explanation}${rentBasis && distinctRents.length > 1 ? ` ${rentBasis.note}` : ""} Deposit stated in ${isLeaseEvidence(ev.get(maxDepositClaim.evidenceId)) ? "the lease" : "the evidence"}.`,
      recommendation: rentBasis
        ? `Ask the landlord to reduce the deposit to no more than ${formatCents(maxDepositCents(rentBasis.cents))}, in writing.`
        : undefined,
    });
    if (fd) findings.push(fd);
  }

  const appFees = byType(claims, "application_fee");
  const appRule = rule("NS-APPLICATION-FEE");
  if (appRule && appFees.length) {
    const amount = appFees.map(centsOf).find((x) => x !== null) ?? null;
    const r = checkApplicationFee(appRule, { applicationFeeRequested: true, amountCents: amount });
    results.push(r);
    const fd = toFinding(r, appFees, { recommendation: "Decline to pay an application fee and ask the landlord to confirm none is required." });
    if (fd) findings.push(fd);
  }

  const holding = byType(claims, "holding_fee");
  const pet = byType(claims, "pet_deposit");
  const other = byType(claims, "other_upfront_fee");
  const deemedRule = rule("NS-DEPOSIT-DEEMED");
  if (deemedRule && (holding.length || pet.length)) {
    const r = checkUpfrontDeemedDeposit(deemedRule, {
      monthlyRentCents: rentBasis?.cents,
      depositCents: maxDepositClaim ? centsOf(maxDepositClaim) : 0,
      holdingFeeCents: holding.map(centsOf).reduce<number>((a, b) => a + (b ?? 0), 0) || null,
      petDepositCents: pet.map(centsOf).reduce<number>((a, b) => a + (b ?? 0), 0) || null,
    });
    results.push(r);
    const fd = toFinding(r, [...holding, ...pet, ...(maxDepositClaim ? [maxDepositClaim] : [])]);
    if (fd) findings.push(fd);
  }
  if (deemedRule && other.some((c) => c.normalized === "first_and_last")) {
    findings.push({
      key: "legal:NS-DEPOSIT-DEEMED:first_and_last",
      category: "legal",
      label: "needs_review",
      severity: "caution",
      title: "Upfront 'first and last month' payment requested",
      explanation:
        "The advertiser asks for first and last month's rent upfront. Nova Scotia deems money obtained in addition to rent to be a security deposit (limited to half a month's rent). Whether prepaid 'last month' rent is treated as a deposit depends on the facts — SafeLease flags this for review rather than deciding it.",
      recommendation: "Ask the Residential Tenancies Program or a legal clinic before prepaying more than the first month's rent.",
      ruleKey: deemedRule.ruleKey,
      ruleVersion: deemedRule.version,
      citationLabel: deemedRule.citation,
      citationUrl: deemedRule.sourceUrl,
      claimIds: other.map((c) => c.id),
      evidenceIds: [...new Set(other.map((c) => c.evidenceId))],
      requiresHumanReview: true,
    });
  }

  const petRule = rule("NS-PET-DEPOSIT");
  if (petRule && pet.length) {
    const r = checkPetDeposit(petRule, { mentioned: true, petDepositCents: pet.map(centsOf).find((x) => x !== null) ?? null });
    results.push(r);
    const fd = toFinding(r, pet);
    if (fd) findings.push(fd);
  }

  const sin = byType(claims, "sensitive_info_request").filter((c) => c.normalized === "sin");
  const sinRule = rule("NS-SIN");
  if (sinRule && sin.length) {
    const r = checkSinRequest(sinRule, { sinRequested: true });
    results.push(r);
    const fd = toFinding(r, sin, { recommendation: "You can decline to provide your SIN; ask whether a credit check can use other identification." });
    if (fd) findings.push(fd);
  }

  const late = byType(claims, "late_fee");
  const lateRule = rule("NS-LATE-FEE");
  if (lateRule && late.length) {
    const c = late[0]!;
    const pct = c.normalized.startsWith("percent:") ? Number(c.normalized.slice(8)) : null;
    const amt = c.normalized.startsWith("amount:") ? Number(c.normalized.slice(7)) : null;
    const r = checkLateFee(lateRule, { monthlyRentCents: rentBasis?.cents ?? null, lateFeeCents: amt, lateFeePercent: pct });
    results.push(r);
    const fd = toFinding(r, late);
    if (fd) findings.push(fd);
  }

  const entry = byType(claims, "entry_notice");
  const entryRule = rule("NS-ENTRY-NOTICE");
  if (entryRule && entry.length) {
    const c = entry[0]!;
    const r = checkEntryNotice(entryRule, {
      noNotice: c.normalized === "no_notice",
      noticeHours: c.normalized.startsWith("hours:") ? Number(c.normalized.slice(6)) : null,
    });
    results.push(r);
    const fd = toFinding(r, entry);
    if (fd) findings.push(fd);
  }

  return { findings, results, rentBasis };
}
