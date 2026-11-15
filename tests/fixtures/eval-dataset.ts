/**
 * Labeled evaluation cases (fictional). `expect` = finding keys that must be
 * present; `forbid` = keys that must NOT be present (false-positive checks).
 * These measure the engine on this dataset only — not real-world fraud accuracy.
 */
import * as T from "../../src/server/seed/demo-texts";

export interface EvalCase {
  name: string;
  docs: Array<{ kind: "listing_text" | "landlord_message" | "landlord_response" | "lease"; text: string; supersedesPrev?: boolean }>;
  expect: string[];
  forbid: string[];
}

export const EVAL_CASES: EvalCase[] = [
  { name: "A: pressure + recipient + SIN", docs: [{ kind: "listing_text", text: T.LISTING_SCREENSHOT_TEXT }, { kind: "landlord_message", text: T.MESSAGE_TEXT }], expect: ["warning:payment_pressure", "warning:viewing_refused", "warning:payment_recipient_differs", "legal:NS-DEPOSIT-MAX", "legal:NS-SIN", "gap:rental_authority"], forbid: ["contradiction:rent"] },
  { name: "B: normal listing, unverified", docs: [{ kind: "listing_text", text: T.CASE_B_LISTING }, { kind: "landlord_message", text: T.CASE_B_MESSAGE }], expect: ["gap:rental_authority", "gap:viewing"], forbid: ["warning:payment_pressure", "legal:NS-DEPOSIT-MAX", "warning:viewing_refused", "warning:unusual_payment_method"] },
  { name: "C: excessive lease deposit", docs: [{ kind: "lease", text: T.CASE_C_LEASE }], expect: ["legal:NS-DEPOSIT-MAX"], forbid: ["warning:payment_pressure"] },
  { name: "D: listing vs lease rent", docs: [{ kind: "listing_text", text: T.CASE_D_LISTING }, { kind: "lease", text: T.CASE_D_LEASE }], expect: ["contradiction:rent"], forbid: ["legal:NS-DEPOSIT-MAX", "contradiction:lease_term"] },
  { name: "F: revision resolves rent, deposit remains", docs: [{ kind: "listing_text", text: T.LISTING_SCREENSHOT_TEXT }, { kind: "lease", text: T.LEASE_V1_TEXT }, { kind: "lease", text: T.LEASE_V2_TEXT, supersedesPrev: true }], expect: ["legal:NS-DEPOSIT-MAX"], forbid: ["contradiction:rent", "contradiction:utilities:heat", "legal:NS-LATE-FEE"] },
  { name: "Application fee", docs: [{ kind: "listing_text", text: "1 bedroom apartment in Dartmouth, $1,300/month. A $75 application fee is required to apply. Viewings by appointment." }], expect: ["legal:NS-APPLICATION-FEE"], forbid: ["warning:payment_pressure"] },
  { name: "Wire transfer + gift cards", docs: [{ kind: "landlord_message", text: "Please send the deposit by Western Union or with gift cards. Rent is $1,500/month." }], expect: ["warning:unusual_payment_method"], forbid: [] },
  { name: "Low rent, foreign phone, viewing offered (no warning)", docs: [{ kind: "listing_text", text: "Cozy 2 bedroom apartment, $700/month. Call +44 20 7946 0958. Happy to show the unit this weekend. Security deposit of $350." }], expect: ["gap:rental_authority"], forbid: ["warning:payment_pressure", "warning:viewing_refused", "legal:NS-DEPOSIT-MAX", "warning:unusual_payment_method"] },
  { name: "Recipient changed between messages", docs: [{ kind: "landlord_message", text: "Please e-transfer the deposit to Anna Kowalski." }, { kind: "landlord_message", text: "Sorry, send the money to Brian Choi instead, Anna is away." }], expect: ["contradiction:payment_recipient_changed"], forbid: [] },
  { name: "Holding fee pushes over limit", docs: [{ kind: "landlord_message", text: "Rent is $1,400/month. The security deposit is $700 plus a $200 holding fee to reserve the unit." }], expect: ["legal:NS-DEPOSIT-DEEMED"], forbid: [] },
  { name: "Prompt injection", docs: [{ kind: "listing_text", text: T.INJECTION_LISTING }], expect: ["warning:embedded_instructions", "gap:rental_authority"], forbid: [] },
  { name: "Lookalike link", docs: [{ kind: "landlord_message", text: "Complete payment securely at https://kijiji-rental-payments.com/secure to hold the unit." }], expect: ["warning:suspicious_link"], forbid: [] },
];
