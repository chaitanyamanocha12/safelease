/**
 * Deterministic Nova Scotia rule checks. Pure functions: facts in, result out.
 * The LLM is never consulted for these outcomes.
 */
import { formatCents, halfMonthCents, percentChange } from "@/lib/money";

export type LegalOutcome =
  | "clear_violation"
  | "potential_issue"
  | "compliant"
  | "not_applicable"
  | "insufficient_facts"
  | "guidance";

export interface RuleMeta {
  ruleKey: string;
  version: number;
  title: string;
  citation: string;
  sourceUrl: string;
  reviewStatus: "verified" | "pending_review" | "rejected" | "superseded";
  verifiedOn: string | null;
  params: Record<string, number | string | boolean>;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface LegalCheckResult {
  ruleKey: string;
  ruleVersion: number;
  outcome: LegalOutcome;
  title: string;
  explanation: string;
  facts: Record<string, string>;
  citation: string;
  sourceUrl: string;
  /** True when the rule version has not been verified by a reviewer. */
  needsReview: boolean;
}

function result(meta: RuleMeta, outcome: LegalOutcome, explanation: string, facts: Record<string, string> = {}): LegalCheckResult {
  return {
    ruleKey: meta.ruleKey,
    ruleVersion: meta.version,
    outcome,
    title: meta.title,
    explanation,
    facts,
    citation: meta.citation,
    sourceUrl: meta.sourceUrl,
    needsReview: meta.reviewStatus !== "verified",
  };
}

const num = (meta: RuleMeta, key: string, def: number) => {
  const v = meta.params[key];
  return typeof v === "number" ? v : def;
};

// ── Deposits ────────────────────────────────────────────────────────────────

export function maxDepositCents(monthlyRentCents: number, fraction = 0.5): number {
  return fraction === 0.5 ? halfMonthCents(monthlyRentCents) : Math.floor(monthlyRentCents * fraction);
}

export function checkDepositMax(meta: RuleMeta, f: { monthlyRentCents?: number | null; depositCents?: number | null }): LegalCheckResult {
  if (!f.monthlyRentCents || f.depositCents === null || f.depositCents === undefined) {
    return result(meta, "insufficient_facts", "Both the monthly rent and the deposit amount are needed to check the deposit limit.");
  }
  const max = maxDepositCents(f.monthlyRentCents, num(meta, "maxFractionOfMonthlyRent", 0.5));
  const facts = { monthlyRent: formatCents(f.monthlyRentCents), deposit: formatCents(f.depositCents), maximum: formatCents(max) };
  if (f.depositCents > max) {
    return result(
      meta,
      "clear_violation",
      `A ${formatCents(f.depositCents)} security deposit exceeds the ${formatCents(max)} maximum (half of ${formatCents(f.monthlyRentCents)} monthly rent) if these amounts are accurate. The excess is ${formatCents(f.depositCents - max)}.`,
      facts,
    );
  }
  return result(meta, "compliant", `A ${formatCents(f.depositCents)} deposit is within the ${formatCents(max)} maximum for ${formatCents(f.monthlyRentCents)} rent.`, facts);
}

export function checkUpfrontDeemedDeposit(
  meta: RuleMeta,
  f: { monthlyRentCents?: number | null; depositCents?: number | null; holdingFeeCents?: number | null; petDepositCents?: number | null; otherUpfrontCents?: number | null },
): LegalCheckResult {
  const extras = [f.holdingFeeCents, f.petDepositCents, f.otherUpfrontCents].filter((x): x is number => typeof x === "number" && x > 0);
  if (extras.length === 0) return result(meta, "not_applicable", "No holding fee, pet deposit or other extra upfront amount was identified.");
  if (!f.monthlyRentCents) return result(meta, "insufficient_facts", "Monthly rent is needed to assess combined upfront amounts.");
  const total = (f.depositCents ?? 0) + extras.reduce((a, b) => a + b, 0);
  const max = maxDepositCents(f.monthlyRentCents, num(meta, "maxFractionOfMonthlyRent", 0.5));
  const facts = { combinedDepositLikeAmounts: formatCents(total), maximum: formatCents(max) };
  if (total > max) {
    return result(
      meta,
      "clear_violation",
      `Extra amounts requested beyond rent (holding/key/pet or similar) are treated as security deposit. Combined with any deposit they total ${formatCents(total)}, above the ${formatCents(max)} maximum.`,
      facts,
    );
  }
  return result(meta, "potential_issue", `Extra upfront amounts are treated as part of the security deposit. The combined ${formatCents(total)} is within the ${formatCents(max)} maximum, but should be documented as deposit and held in trust.`, facts);
}

export function checkApplicationFee(meta: RuleMeta, f: { applicationFeeRequested: boolean; amountCents?: number | null }): LegalCheckResult {
  if (!f.applicationFeeRequested) return result(meta, "not_applicable", "No application fee was identified in the evidence.");
  return result(
    meta,
    "clear_violation",
    `An application fee${f.amountCents ? ` of ${formatCents(f.amountCents)}` : ""} appears to be requested. Nova Scotia prohibits charging money in respect of an application to become a tenant.`,
    f.amountCents ? { applicationFee: formatCents(f.amountCents) } : {},
  );
}

export function checkPetDeposit(meta: RuleMeta, f: { petDepositCents?: number | null; mentioned: boolean }): LegalCheckResult {
  if (!f.mentioned && !f.petDepositCents) return result(meta, "not_applicable", "No separate pet deposit was identified.");
  return result(
    meta,
    "clear_violation",
    `A separate pet deposit${f.petDepositCents ? ` of ${formatCents(f.petDepositCents)}` : ""} appears to be requested. The official Renting Guide states landlords can't charge an additional deposit for pets.`,
  );
}

// ── Rent increases ──────────────────────────────────────────────────────────

export interface RentIncreaseFacts {
  isExistingTenant: boolean | null;
  samePremises?: boolean | null;
  currentRentCents?: number | null;
  newRentCents?: number | null;
  /** ISO date the increase takes effect. */
  effectiveDate?: string | null;
  /** ISO date written notice was given. */
  noticeDate?: string | null;
  /** ISO date of the previous increase (or tenancy start). */
  lastIncreaseDate?: string | null;
  tenancyStartDate?: string | null;
  leaseType?: "year_to_year" | "month_to_month" | "week_to_week" | "fixed_term" | "unknown" | null;
  /** For fixed-term: increase amounts/dates are stated in the lease. */
  increaseStatedInLease?: boolean | null;
  isPublicHousingIncomeBased?: boolean;
  isLandLeaseCommunity?: boolean;
}

function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

export function checkRentCap(meta: RuleMeta, f: RentIncreaseFacts): LegalCheckResult {
  if (f.isPublicHousingIncomeBased || f.isLandLeaseCommunity) {
    return result(meta, "not_applicable", "The rent cap does not apply to income-based public housing increases or compliant land-lease community increases.");
  }
  if (f.isExistingTenant === false) {
    return result(
      meta,
      "not_applicable",
      "The temporary rent cap limits increases for existing tenants. It does not set a maximum starting rent for a new tenant signing a new lease.",
    );
  }
  if (f.isExistingTenant === null || f.isExistingTenant === undefined) {
    return result(meta, "insufficient_facts", "Whether you are an existing tenant of the same unit determines if the cap applies.");
  }
  if (f.samePremises === false) {
    return result(meta, "not_applicable", "The cap applies to increases for the same residential premises. A move to a different unit is a new tenancy.");
  }
  const effective = parseDate(f.effectiveDate);
  if (!f.currentRentCents || !f.newRentCents || !effective) {
    return result(meta, "insufficient_facts", "The current rent, the proposed rent and the date the increase takes effect are needed.");
  }
  const from = parseDate(meta.effectiveFrom ?? "2026-01-01")!;
  const to = parseDate(meta.effectiveTo ?? "2027-12-31")!;
  if (effective < from || effective > to) {
    return result(
      meta,
      "insufficient_facts",
      `The increase takes effect on ${f.effectiveDate}, outside the period this rule version covers (${meta.effectiveFrom}–${meta.effectiveTo}). Check current rules with the Residential Tenancies Program.`,
    );
  }
  const cap = num(meta, "capPercent", 5);
  const pct = percentChange(f.currentRentCents, f.newRentCents);
  const allowed = Math.floor(f.currentRentCents * (1 + cap / 100));
  const facts = {
    currentRent: formatCents(f.currentRentCents),
    proposedRent: formatCents(f.newRentCents),
    increasePercent: `${pct.toFixed(2)}%`,
    maximumUnderCap: formatCents(allowed),
  };
  if (f.newRentCents > allowed) {
    return result(
      meta,
      "clear_violation",
      `The proposed increase is ${pct.toFixed(2)}%, above the ${cap}% cap for existing tenants. Under the cap the maximum would be ${formatCents(allowed)}.`,
      facts,
    );
  }
  return result(meta, "compliant", `The proposed increase of ${pct.toFixed(2)}% is within the ${cap}% cap.`, facts);
}

export function checkRentIncreaseNotice(meta: RuleMeta, f: RentIncreaseFacts): LegalCheckResult {
  const effective = parseDate(f.effectiveDate);
  if (!effective) return result(meta, "insufficient_facts", "The date the increase takes effect is needed.");
  const issues: string[] = [];
  const facts: Record<string, string> = { effectiveDate: f.effectiveDate! };

  const start = parseDate(f.tenancyStartDate);
  if (start && effective < addMonths(start, 12)) {
    issues.push("Rent cannot increase during the first 12 months of a tenancy.");
  }
  const last = parseDate(f.lastIncreaseDate);
  if (last && effective < addMonths(last, 12)) {
    issues.push("Rent can only be increased once in a 12-month period.");
  }
  if (f.leaseType === "fixed_term") {
    if (f.increaseStatedInLease === false) issues.push("For fixed-term leases, the amounts and dates of any increases must be stated in the lease.");
    if (f.increaseStatedInLease === null || f.increaseStatedInLease === undefined)
      return result(meta, "insufficient_facts", "For a fixed-term lease, whether the increase was written into the lease determines compliance.", facts);
  } else {
    const notice = parseDate(f.noticeDate);
    if (!notice || !f.leaseType || f.leaseType === "unknown") {
      if (issues.length === 0) return result(meta, "insufficient_facts", "The lease type and the date written notice was given are needed to check notice timing.", facts);
    } else {
      const required =
        f.leaseType === "week_to_week"
          ? new Date(effective.getTime() - num(meta, "noticeWeeksWeekly", 8) * 7 * 86400000)
          : addMonths(effective, -num(meta, "noticeMonthsPeriodic", 4));
      facts.noticeGiven = f.noticeDate!;
      facts.latestValidNoticeDate = required.toISOString().slice(0, 10);
      if (notice > required) {
        issues.push(
          f.leaseType === "week_to_week"
            ? "Week-to-week leases require 8 weeks' written notice before the increase."
            : "Year-to-year and month-to-month leases require 4 months' written notice before the increase.",
        );
      }
    }
  }
  if (issues.length > 0) return result(meta, "clear_violation", `${issues.join(" ")} (Based on the dates you entered.)`, facts);
  return result(meta, "compliant", "Based on the dates entered, the frequency and notice requirements appear to be met.", facts);
}

// ── Deposit return ─────────────────────────────────────────────────────────

export function depositReturnDeadline(tenancyEndIso: string, days = 10): string | null {
  const end = parseDate(tenancyEndIso);
  if (!end) return null;
  return new Date(end.getTime() + days * 86400000).toISOString().slice(0, 10);
}

export function checkDepositReturn(
  meta: RuleMeta,
  f: { tenancyEndDate?: string | null; today: string; returnedFully?: boolean; landlordClaimFiled?: boolean; tenantAgreedInWriting?: boolean },
): LegalCheckResult {
  if (!f.tenancyEndDate) return result(meta, "insufficient_facts", "Add the date your tenancy ended to calculate the deposit timeline.");
  const days = num(meta, "returnDays", 10);
  const deadline = depositReturnDeadline(f.tenancyEndDate, days)!;
  const facts = { tenancyEnded: f.tenancyEndDate, returnOrClaimDeadline: deadline };
  if (f.returnedFully) return result(meta, "compliant", "You recorded that the full deposit was returned.", facts);
  if (f.landlordClaimFiled || f.tenantAgreedInWriting) {
    return result(
      meta,
      "guidance",
      "The landlord reports filing a security deposit claim (or you agreed in writing). You may dispute a claim with the Residential Tenancies Program; claims cannot include ordinary wear and tear.",
      facts,
    );
  }
  if (f.today > deadline) {
    return result(
      meta,
      "potential_issue",
      `More than ${days} days have passed since the tenancy ended (${deadline}) and no return or landlord claim is recorded. The official guidance says tenants may apply for return of the deposit after waiting at least 10 days (Form S).`,
      facts,
    );
  }
  return result(meta, "guidance", `The landlord must return the deposit with interest, or file a claim, by ${deadline}.`, facts);
}

// ── Lease clause checks ────────────────────────────────────────────────────

export function checkLateFee(meta: RuleMeta, f: { monthlyRentCents?: number | null; lateFeeCents?: number | null; lateFeePercent?: number | null }): LegalCheckResult {
  const maxPct = num(meta, "maxPercentPerMonth", 1);
  if (f.lateFeePercent === null && f.lateFeeCents === null) return result(meta, "not_applicable", "No late fee term identified.");
  if (f.lateFeePercent !== null && f.lateFeePercent !== undefined) {
    return f.lateFeePercent > maxPct
      ? result(meta, "potential_issue", `The lease states a ${f.lateFeePercent}% late charge; the official guide describes 1% of monthly rent per month.`)
      : result(meta, "compliant", `The ${f.lateFeePercent}% late charge is consistent with the 1% guidance.`);
  }
  if (!f.monthlyRentCents) return result(meta, "insufficient_facts", "Monthly rent is needed to compare the late fee against the 1% guidance.");
  const max = Math.floor((f.monthlyRentCents * maxPct) / 100);
  return (f.lateFeeCents ?? 0) > max
    ? result(meta, "potential_issue", `A ${formatCents(f.lateFeeCents!)} late fee is more than 1% of ${formatCents(f.monthlyRentCents)} rent (${formatCents(max)}) per month described in the official guide.`)
    : result(meta, "compliant", `The late fee is within 1% of monthly rent (${formatCents(max)}).`);
}

export function checkEntryNotice(meta: RuleMeta, f: { noticeHours: number | null; noNotice: boolean }): LegalCheckResult {
  const min = num(meta, "minNoticeHours", 24);
  if (f.noNotice) return result(meta, "potential_issue", "The lease appears to allow landlord entry without notice or at any time. The official guide describes 24 hours' written notice (except emergencies), during daylight hours.");
  if (f.noticeHours === null) return result(meta, "not_applicable", "No entry clause identified.");
  if (f.noticeHours < min) return result(meta, "potential_issue", `The lease allows entry with ${f.noticeHours} hours' notice; the official guide describes 24 hours' written notice.`);
  return result(meta, "compliant", `Entry notice of ${f.noticeHours} hours is consistent with the 24-hour guidance.`);
}

export function checkSinRequest(meta: RuleMeta, f: { sinRequested: boolean }): LegalCheckResult {
  if (!f.sinRequested) return result(meta, "not_applicable", "No Social Insurance Number request identified.");
  return result(
    meta,
    "potential_issue",
    "A Social Insurance Number was requested. Landlords may run credit checks but cannot force you to provide your SIN. Sharing it with an unverified party also increases identity-theft risk.",
  );
}

export function guidance(meta: RuleMeta, explanation: string): LegalCheckResult {
  return result(meta, "guidance", explanation);
}
