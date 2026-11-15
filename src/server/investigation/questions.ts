/**
 * Verification question generation from open findings. Questions are polite,
 * specific and non-accusatory.
 */
import { formatCents } from "@/lib/money";
import { maxDepositCents } from "../legal/rules";
import { activeClaims, byType, centsOf } from "./active";
import type { CaseSnapshot, FindingDraft, VerificationQuestion } from "./types";

export function generateQuestions(s: CaseSnapshot, findings: FindingDraft[]): VerificationQuestion[] {
  const claims = activeClaims(s);
  const has = (key: string) => findings.find((f) => f.key === key || f.key.startsWith(`${key}:`));
  const qs: VerificationQuestion[] = [];
  const add = (q: VerificationQuestion) => qs.push(q);

  const rentF = has("contradiction:rent");
  if (rentF) {
    const values = [...new Set(byType(claims, "rent").map((c) => centsOf(c)).filter((x): x is number => x !== null))].map((x) => formatCents(x));
    add({
      key: "q:rent",
      question: `I've seen different monthly rent amounts (${values.join(" and ")}). Could you confirm the correct rent and, if the lease needs correcting, send an updated copy?`,
      reason: rentF.title,
      findingKeys: [rentF.key],
      purpose: "rent_discrepancy",
      priority: 1,
    });
  }

  const depF = has("legal:NS-DEPOSIT-MAX");
  if (depF) {
    const rents = [...new Set(byType(claims, "rent").map(centsOf).filter((x): x is number => x !== null))].sort((a, b) => a - b);
    const max =
      rents.length === 0
        ? ""
        : rents.length === 1
          ? ` (${formatCents(maxDepositCents(rents[0]!))} here)`
          : ` (${rents.map((r) => `${formatCents(maxDepositCents(r))} if the rent is ${formatCents(r)}`).join(", or ")})`;
    add({
      key: "q:deposit",
      question: `My understanding is that in Nova Scotia a security deposit can be at most half of one month's rent${max}. Could you confirm the deposit will be adjusted accordingly?`,
      reason: depF.title,
      findingKeys: [depF.key],
      purpose: "clarify_deposit",
      priority: 2,
    });
  }

  const appF = has("legal:NS-APPLICATION-FEE");
  if (appF) {
    add({
      key: "q:application_fee",
      question: "Nova Scotia doesn't allow application fees. Can you confirm there's no fee to apply for this unit?",
      reason: appF.title,
      findingKeys: [appF.key],
      purpose: "clarify_fees",
      priority: 3,
    });
  }

  const recF = has("warning:payment_recipient_differs") ?? has("contradiction:payment_recipient_changed");
  if (recF) {
    const recipient = byType(claims, "payment_recipient")[0]?.value;
    const contact = byType(claims, "contact_name")[0]?.value;
    add({
      key: "q:recipient",
      question: `Payment is being directed to ${recipient ? `“${recipient}”` : "a different person"}${contact ? `, while I've been speaking with ${contact}` : ""}. Could you explain their role, and share written authorization from the owner or property manager that I can confirm independently?`,
      reason: recF.title,
      findingKeys: [recF.key],
      purpose: "payment_recipient",
      priority: 1,
    });
  }

  const viewF = has("warning:viewing_refused") ?? has("warning:payment_before_viewing") ?? has("gap:viewing");
  if (viewF) {
    add({
      key: "q:viewing",
      question: "Before any payment, could we arrange an in-person viewing — or a live video tour with someone who can show me the unit and the building entrance?",
      reason: viewF.title,
      findingKeys: [viewF.key],
      purpose: "request_viewing",
      priority: viewF.key === "gap:viewing" ? 5 : 1,
    });
  }

  const authF = has("gap:rental_authority");
  if (authF) {
    add({
      key: "q:authority",
      question: "Could you share the name of the owner or the property-management company, so I can confirm the rental through their publicly listed contact information?",
      reason: authF.title,
      findingKeys: [authF.key],
      purpose: "verify_management",
      priority: 4,
    });
  }

  const sinF = has("legal:NS-SIN");
  if (sinF) {
    add({
      key: "q:sin",
      question: "I'd prefer not to share my Social Insurance Number. Is there another way to complete a credit or reference check?",
      reason: sinF.title,
      findingKeys: [sinF.key],
      purpose: "general",
      priority: 3,
    });
  }

  const methodF = has("warning:unusual_payment_method");
  if (methodF) {
    add({
      key: "q:payment_method",
      question: "Would it be possible to pay by a traceable method, such as a cheque or e-transfer to a verified business account, after the lease is signed?",
      reason: methodF.title,
      findingKeys: [methodF.key],
      purpose: "clarify_fees",
      priority: 2,
    });
  }

  const utilF = findings.find((f) => f.key.startsWith("contradiction:utilities"));
  if (utilF) {
    add({ key: "q:utilities", question: "Could you confirm exactly which utilities are included in the rent, and make sure the lease reflects that?", reason: utilF.title, findingKeys: [utilF.key], purpose: "utilities", priority: 3 });
  }

  const addrF = has("contradiction:address");
  if (addrF) {
    add({ key: "q:address", question: "I've seen two different addresses for this unit. Could you confirm the exact civic address and unit number?", reason: addrF.title, findingKeys: [addrF.key], purpose: "general", priority: 2 });
  }

  if (has("unknown:lease")) {
    add({ key: "q:lease", question: "Could you send a copy of the lease you plan to use so I can review it before paying anything?", reason: "No lease reviewed yet", findingKeys: ["unknown:lease"], purpose: "corrected_lease", priority: 4 });
  }
  if (has("unknown:rent")) {
    add({ key: "q:rent_unknown", question: "What is the monthly rent, and what does it include?", reason: "Monthly rent not stated", findingKeys: ["unknown:rent"], purpose: "general", priority: 2 });
  }

  return qs.sort((a, b) => a.priority - b.priority);
}
