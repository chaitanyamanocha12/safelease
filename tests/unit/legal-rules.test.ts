import { describe, expect, it } from "vitest";
import { catalogRuleLookup } from "@/server/legal/engine";
import { checkApplicationFee, checkDepositMax, checkDepositReturn, checkEntryNotice, checkLateFee, checkRentCap, checkRentIncreaseNotice, checkUpfrontDeemedDeposit, depositReturnDeadline, maxDepositCents } from "@/server/legal/rules";
import { LEGAL_RULES, SOURCE_BY_KEY } from "@/server/legal/catalog";

const rule = catalogRuleLookup();
const r = (k: string) => rule(k)!;

describe("Nova Scotia deposit rules", () => {
  it("computes half a month's rent in integer cents", () => {
    expect(maxDepositCents(160000)).toBe(80000);
    expect(maxDepositCents(160001)).toBe(80000);
    expect(maxDepositCents(139999)).toBe(69999);
  });
  it("flags deposits above the maximum and accepts the boundary", () => {
    expect(checkDepositMax(r("NS-DEPOSIT-MAX"), { monthlyRentCents: 160000, depositCents: 120000 }).outcome).toBe("clear_violation");
    expect(checkDepositMax(r("NS-DEPOSIT-MAX"), { monthlyRentCents: 160000, depositCents: 80000 }).outcome).toBe("compliant");
    expect(checkDepositMax(r("NS-DEPOSIT-MAX"), { monthlyRentCents: 160000, depositCents: 80001 }).outcome).toBe("clear_violation");
    expect(checkDepositMax(r("NS-DEPOSIT-MAX"), { monthlyRentCents: null, depositCents: 80000 }).outcome).toBe("insufficient_facts");
  });
  it("treats holding fees as part of the deposit", () => {
    expect(checkUpfrontDeemedDeposit(r("NS-DEPOSIT-DEEMED"), { monthlyRentCents: 160000, depositCents: 70000, holdingFeeCents: 20000 }).outcome).toBe("clear_violation");
    expect(checkUpfrontDeemedDeposit(r("NS-DEPOSIT-DEEMED"), { monthlyRentCents: 160000, depositCents: 50000, holdingFeeCents: 20000 }).outcome).toBe("potential_issue");
  });
  it("prohibits application fees", () => {
    expect(checkApplicationFee(r("NS-APPLICATION-FEE"), { applicationFeeRequested: true, amountCents: 5000 }).outcome).toBe("clear_violation");
    expect(checkApplicationFee(r("NS-APPLICATION-FEE"), { applicationFeeRequested: false }).outcome).toBe("not_applicable");
  });
  it("calculates the 10-day deposit return deadline", () => {
    expect(depositReturnDeadline("2026-08-31")).toBe("2026-09-10");
    expect(checkDepositReturn(r("NS-DEPOSIT-RETURN"), { tenancyEndDate: "2026-08-31", today: "2026-09-15" }).outcome).toBe("potential_issue");
    expect(checkDepositReturn(r("NS-DEPOSIT-RETURN"), { tenancyEndDate: "2026-08-31", today: "2026-09-05" }).outcome).toBe("guidance");
    expect(checkDepositReturn(r("NS-DEPOSIT-RETURN"), { tenancyEndDate: "2026-08-31", today: "2026-09-15", landlordClaimFiled: true }).outcome).toBe("guidance");
  });
});

describe("rent increase rules", () => {
  const cap = r("NS-RENT-CAP");
  it("does not apply the cap to new tenants", () => {
    expect(checkRentCap(cap, { isExistingTenant: false, currentRentCents: 150000, newRentCents: 200000, effectiveDate: "2026-09-01" }).outcome).toBe("not_applicable");
  });
  it("applies 5% to existing tenants in 2026 and 2027", () => {
    expect(checkRentCap(cap, { isExistingTenant: true, currentRentCents: 150000, newRentCents: 157500, effectiveDate: "2026-09-01" }).outcome).toBe("compliant");
    expect(checkRentCap(cap, { isExistingTenant: true, currentRentCents: 150000, newRentCents: 157600, effectiveDate: "2027-12-31" }).outcome).toBe("clear_violation");
  });
  it("does not decide increases after the cap expires", () => {
    expect(checkRentCap(cap, { isExistingTenant: true, currentRentCents: 150000, newRentCents: 180000, effectiveDate: "2028-01-01" }).outcome).toBe("insufficient_facts");
  });
  it("requires existing-tenant status to decide", () => {
    expect(checkRentCap(cap, { isExistingTenant: null, currentRentCents: 1, newRentCents: 2, effectiveDate: "2026-09-01" }).outcome).toBe("insufficient_facts");
  });
  it("checks frequency and notice", () => {
    const n = r("NS-RENT-INCREASE-NOTICE");
    expect(checkRentIncreaseNotice(n, { isExistingTenant: true, effectiveDate: "2026-12-01", noticeDate: "2026-09-15", leaseType: "month_to_month" }).outcome).toBe("clear_violation");
    expect(checkRentIncreaseNotice(n, { isExistingTenant: true, effectiveDate: "2026-12-01", noticeDate: "2026-07-31", leaseType: "month_to_month" }).outcome).toBe("compliant");
    expect(checkRentIncreaseNotice(n, { isExistingTenant: true, effectiveDate: "2026-12-01", noticeDate: "2026-07-01", leaseType: "year_to_year", tenancyStartDate: "2026-03-01" }).outcome).toBe("clear_violation");
    expect(checkRentIncreaseNotice(n, { isExistingTenant: true, effectiveDate: "2026-12-01", leaseType: "fixed_term", increaseStatedInLease: false }).outcome).toBe("clear_violation");
  });
});

describe("lease clause guidance", () => {
  it("compares late fees with the 1% guidance", () => {
    expect(checkLateFee(r("NS-LATE-FEE"), { monthlyRentCents: 160000, lateFeeCents: 7500, lateFeePercent: null }).outcome).toBe("potential_issue");
    expect(checkLateFee(r("NS-LATE-FEE"), { monthlyRentCents: 160000, lateFeeCents: 1600, lateFeePercent: null }).outcome).toBe("compliant");
  });
  it("flags entry without notice", () => {
    expect(checkEntryNotice(r("NS-ENTRY-NOTICE"), { noNotice: true, noticeHours: null }).outcome).toBe("potential_issue");
    expect(checkEntryNotice(r("NS-ENTRY-NOTICE"), { noNotice: false, noticeHours: 24 }).outcome).toBe("compliant");
  });
});

describe("rule catalog integrity", () => {
  it("every rule cites an official Nova Scotia source", () => {
    for (const rule of LEGAL_RULES) {
      const src = SOURCE_BY_KEY.get(rule.sourceKey);
      expect(src, rule.ruleKey).toBeTruthy();
      expect(src!.url).toMatch(/^https:\/\/(www\.)?(novascotia\.ca|nslegislature\.ca)\//);
      expect(rule.citation.length).toBeGreaterThan(5);
    }
  });
  it("marks unreviewed rule versions as needing review", () => {
    const meta = { ...r("NS-DEPOSIT-MAX"), reviewStatus: "pending_review" as const };
    expect(checkDepositMax(meta, { monthlyRentCents: 160000, depositCents: 120000 }).needsReview).toBe(true);
  });
});
