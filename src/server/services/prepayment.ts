/**
 * Before-you-pay review. Deterministic; it never concludes a payment is safe.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { finding, prepaymentReview } from "../db/schema";
import { newId } from "@/lib/ids";
import { formatCents } from "@/lib/money";
import { maxDepositCents } from "../legal/rules";
import { activeClaims, byType, centsOf } from "../investigation/active";
import type { CaseSnapshot } from "../investigation/types";
import { RULE_BY_KEY, SOURCE_BY_KEY } from "../legal/catalog";
import { getInvestigationForUser, loadSnapshot, logEvent } from "./investigations";

export const CHECKLIST = [
  { key: "viewed", label: "I viewed the unit in person, or by live video with someone I could verify" },
  { key: "lease", label: "I have a written lease (Nova Scotia's Standard Form of Lease conditions apply)" },
  { key: "independent", label: "I confirmed the landlord or manager through contact details I found independently" },
  { key: "recipient", label: "The payment recipient is the landlord or a documented property manager" },
  { key: "writing", label: "I have the amount and purpose of the payment in writing" },
  { key: "traceable", label: "I'm paying by a traceable method (not gift cards, crypto or wire services)" },
  { key: "noPressure", label: "I'm not being pressured to pay immediately" },
  { key: "minimalId", label: "I've shared only the minimum personal information needed" },
] as const;

export interface PrepayInput {
  requestedAmountCents?: number | null;
  purpose?: "security_deposit" | "first_month_rent" | "application_fee" | "holding_fee" | "other" | null;
  paymentMethod?: string | null;
  recipientName?: string | null;
  dueBy?: string | null;
  leaseSigned?: boolean | null;
  viewedInPerson?: boolean | null;
  checklist?: Record<string, boolean>;
}

export interface PrepayItem {
  key: string;
  label: string;
  status: "ok" | "concern" | "unknown";
  detail: string;
  citationLabel?: string;
  citationUrl?: string;
}

function cite(ruleKey: string) {
  const r = RULE_BY_KEY.get(ruleKey);
  return r ? { citationLabel: r.citation, citationUrl: SOURCE_BY_KEY.get(r.sourceKey)?.url } : {};
}

export function evaluatePrepayment(s: CaseSnapshot, input: PrepayInput, activeFindingKeys: string[]): { items: PrepayItem[]; concerns: number; unknowns: number; headline: string } {
  const claims = activeClaims(s);
  const rents = byType(claims, "rent").map(centsOf).filter((x): x is number => x !== null);
  const requested = input.requestedAmountCents ?? byType(claims, "requested_payment").map(centsOf).find((x) => x !== null) ?? null;
  const items: PrepayItem[] = [];
  const check = (t: string) => s.checks.find((c) => c.checkType === t)?.status;

  // Amount vs deposit limit
  if (requested === null) items.push({ key: "amount", label: "Requested amount", status: "unknown", detail: "Enter the amount you've been asked to pay." });
  else if (rents.length === 0) items.push({ key: "amount", label: "Requested amount", status: "unknown", detail: `${formatCents(requested)} requested, but the monthly rent isn't known, so the deposit limit can't be calculated.` });
  else {
    const max = maxDepositCents(Math.max(...rents));
    const isRent = input.purpose === "first_month_rent";
    if (isRent) {
      items.push({ key: "amount", label: "Requested amount", status: requested > Math.max(...rents) ? "concern" : "ok", detail: requested > Math.max(...rents) ? `${formatCents(requested)} is more than one month's stated rent (${formatCents(Math.max(...rents))}).` : `${formatCents(requested)} for first month's rent.` });
    } else {
      items.push({
        key: "amount",
        label: "Requested amount vs deposit limit",
        status: requested > max ? "concern" : "ok",
        detail: requested > max ? `${formatCents(requested)} exceeds the ${formatCents(max)} maximum deposit (half of ${formatCents(Math.max(...rents))} rent).` : `${formatCents(requested)} is within the ${formatCents(max)} deposit maximum.`,
        ...cite("NS-DEPOSIT-MAX"),
      });
    }
  }

  // Purpose
  if (input.purpose === "application_fee" || byType(claims, "application_fee").length) {
    items.push({ key: "purpose", label: "Payment purpose", status: "concern", detail: "Application fees are prohibited in Nova Scotia.", ...cite("NS-APPLICATION-FEE") });
  } else if (input.purpose === "holding_fee" || byType(claims, "holding_fee").length) {
    items.push({ key: "purpose", label: "Payment purpose", status: "concern", detail: "A holding fee is treated as part of the security deposit and counts toward the half-month limit. Get a written receipt stating it is a deposit.", ...cite("NS-DEPOSIT-DEEMED") });
  } else if (!input.purpose) {
    items.push({ key: "purpose", label: "Payment purpose", status: "unknown", detail: "Confirm in writing what this payment is for." });
  } else {
    items.push({ key: "purpose", label: "Payment purpose", status: "ok", detail: `Stated purpose: ${input.purpose.replace(/_/g, " ")}.` });
  }

  // Timing
  const leaseKnown = input.leaseSigned ?? (s.evidence.some((e) => e.kind === "lease") ? null : false);
  items.push({
    key: "timing",
    label: "Payment timing",
    status: input.leaseSigned === true && input.viewedInPerson === true ? "ok" : input.leaseSigned === false || input.viewedInPerson === false ? "concern" : "unknown",
    detail:
      input.leaseSigned === true && input.viewedInPerson === true
        ? "You've viewed the unit and have a signed lease."
        : `Paying before ${[input.viewedInPerson !== true ? "a viewing" : null, leaseKnown !== true ? "a signed lease" : null].filter(Boolean).join(" and ")} leaves you with little protection if something goes wrong.`,
  });

  // Recipient
  const recipientIssue = activeFindingKeys.some((k) => k === "warning:payment_recipient_differs" || k === "contradiction:payment_recipient_changed");
  const recipientCheck = check("payment_recipient_consistency");
  items.push({
    key: "recipient",
    label: "Recipient identity",
    status: recipientIssue || recipientCheck === "contradicted" ? "concern" : recipientCheck === "supported" ? "ok" : "unknown",
    detail: recipientIssue ? "The payment recipient differs from the person advertising the rental, or changed between messages." : recipientCheck === "supported" ? "You recorded that the recipient matches the landlord or a documented manager." : "The recipient hasn't been confirmed against an independently verified landlord or manager.",
  });

  // Authority & independent verification
  const auth = check("rental_authority");
  items.push({ key: "authority", label: "Landlord authority", status: auth === "supported" ? "ok" : auth === "contradicted" ? "concern" : "unknown", detail: auth === "supported" ? "You recorded independent confirmation of authority to rent." : "Rental authority has not been independently verified." });
  const indep = check("independent_contact");
  items.push({ key: "independent", label: "Independent verification", status: indep === "supported" ? "ok" : indep === "contradicted" ? "concern" : "unknown", detail: indep === "supported" ? "You confirmed contact through an independently found channel." : "No independent contact verification recorded." });

  // Discrepancies
  const contradictions = activeFindingKeys.filter((k) => k.startsWith("contradiction:"));
  items.push({ key: "discrepancies", label: "Unresolved discrepancies", status: contradictions.length ? "concern" : "ok", detail: contradictions.length ? `${contradictions.length} unresolved contradiction(s) in the evidence.` : "No unresolved contradictions in the evidence collected (this doesn't mean the facts are verified)." });

  // Identity documents
  const sensitive = byType(claims, "sensitive_info_request");
  items.push({ key: "identity", label: "Requested identity documents", status: sensitive.length ? "concern" : "ok", detail: sensitive.length ? `Requested: ${[...new Set(sensitive.map((x) => x.value))].join(", ")}. Share only what's needed, after verification.` : "No identity-document requests identified.", ...(sensitive.some((x) => x.normalized === "sin") ? cite("NS-SIN") : {}) });

  // Method & pressure
  const method = (input.paymentMethod ?? byType(claims, "payment_method")[0]?.normalized ?? "").toLowerCase();
  const hard = /wire|western|moneygram|money_transfer|crypto|bitcoin|gift/.test(method);
  const pressure = byType(claims, "urgency").length > 0;
  items.push({
    key: "method",
    label: "Payment method & pressure",
    status: hard || pressure ? "concern" : method ? "ok" : "unknown",
    detail: [hard ? "The payment method is hard to reverse." : null, pressure ? "The advertiser applied time pressure." : null].filter(Boolean).join(" ") || (method ? `Method: ${method.replace(/_/g, " ")}.` : "Payment method not stated."),
  });

  const concerns = items.filter((i) => i.status === "concern").length;
  const unknowns = items.filter((i) => i.status === "unknown").length;
  const headline =
    concerns > 0
      ? `${concerns} concern${concerns === 1 ? "" : "s"} and ${unknowns} open question${unknowns === 1 ? "" : "s"}. We recommend not paying until these are resolved.`
      : unknowns > 0
        ? `No concerns flagged, but ${unknowns} item${unknowns === 1 ? " is" : "s are"} unverified. Resolve them before paying — SafeLease can't guarantee a payment is safe.`
        : "No concerns flagged in the items reviewed. SafeLease can't guarantee a payment is safe — keep receipts and pay by traceable methods.";
  return { items, concerns, unknowns, headline };
}

export async function getPrepayment(userId: string, investigationId: string) {
  await getInvestigationForUser(userId, investigationId);
  const [row] = await db.select().from(prepaymentReview).where(eq(prepaymentReview.investigationId, investigationId));
  const snapshot = await loadSnapshot(investigationId);
  const active = (await db.select({ k: finding.findingKey, l: finding.lifecycle }).from(finding).where(eq(finding.investigationId, investigationId))).filter((f) => f.l === "active").map((f) => f.k);
  const input: PrepayInput = row
    ? { requestedAmountCents: row.requestedAmountCents, purpose: row.purpose, paymentMethod: row.paymentMethod, recipientName: row.recipientName, dueBy: row.dueBy, leaseSigned: row.leaseSigned, viewedInPerson: row.viewedInPerson, checklist: row.checklist }
    : {};
  return { row: row ?? null, input, result: evaluatePrepayment(snapshot, input, active) };
}

export async function savePrepayment(userId: string, investigationId: string, input: PrepayInput) {
  await getInvestigationForUser(userId, investigationId);
  const snapshot = await loadSnapshot(investigationId);
  const active = (await db.select({ k: finding.findingKey, l: finding.lifecycle }).from(finding).where(eq(finding.investigationId, investigationId))).filter((f) => f.l === "active").map((f) => f.k);
  const result = evaluatePrepayment(snapshot, input, active);
  const values = {
    requestedAmountCents: input.requestedAmountCents ?? null,
    purpose: input.purpose ?? null,
    paymentMethod: input.paymentMethod ?? null,
    recipientName: input.recipientName ?? null,
    dueBy: input.dueBy ?? null,
    leaseSigned: input.leaseSigned ?? null,
    viewedInPerson: input.viewedInPerson ?? null,
    checklist: input.checklist ?? {},
    result: result as unknown as Record<string, unknown>,
    updatedAt: new Date(),
  };
  await db.insert(prepaymentReview).values({ id: newId("pp"), investigationId, ownerId: userId, ...values }).onConflictDoUpdate({ target: prepaymentReview.investigationId, set: values });
  await logEvent(investigationId, "prepayment_reviewed", "user", `Before-you-pay review updated: ${result.concerns} concern(s), ${result.unknowns} open question(s).`);
  return result;
}
