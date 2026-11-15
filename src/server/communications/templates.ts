/**
 * Polite, non-accusatory message templates. Deterministic; used directly
 * when no LLM is configured and as the fallback when the LLM fails.
 */
import type { VerificationQuestion } from "../investigation/types";

export const MESSAGE_PURPOSES = [
  "verification_questions",
  "request_viewing",
  "verify_management",
  "clarify_deposit",
  "clarify_fees",
  "rent_discrepancy",
  "corrected_lease",
  "utilities",
  "repair_followup",
  "deposit_return",
] as const;
export type MessagePurpose = (typeof MESSAGE_PURPOSES)[number];

export const PURPOSE_LABEL: Record<MessagePurpose, string> = {
  verification_questions: "Verification questions",
  request_viewing: "Request a viewing",
  verify_management: "Request verifiable management information",
  clarify_deposit: "Clarify deposit requirements",
  clarify_fees: "Clarify unexpected fees",
  rent_discrepancy: "Ask about a rent discrepancy",
  corrected_lease: "Request a corrected lease",
  utilities: "Ask about utilities",
  repair_followup: "Follow up on a promised repair",
  deposit_return: "Request deposit information / return",
};

export interface DraftContext {
  recipientName?: string | null;
  propertyLabel?: string | null;
  questions?: VerificationQuestion[];
  repair?: { title: string; reportedOn?: string | null; promisedBy?: string | null };
  deposit?: { amount?: string | null; tenancyEndedOn?: string | null; deadline?: string | null };
  senderName?: string | null;
}

const greet = (name?: string | null) => `Hi${name ? ` ${name.split(" ")[0]}` : ""},`;
const sign = (name?: string | null) => `\n\nThank you,\n${name ?? "[Your name]"}`;

export function renderTemplate(purpose: MessagePurpose, ctx: DraftContext): { subject: string; body: string } {
  const prop = ctx.propertyLabel ? ` for ${ctx.propertyLabel}` : "";
  const qs = (ctx.questions ?? []).slice(0, 5);
  const list = (items: string[]) => items.map((q, i) => `${i + 1}. ${q}`).join("\n");
  switch (purpose) {
    case "verification_questions":
      return {
        subject: `Questions about the rental${prop}`,
        body: `${greet(ctx.recipientName)}\n\nThank you for the information about the rental${prop}. Before I can move forward, I'd appreciate your help with a few questions:\n\n${list(
          qs.length ? qs.map((q) => q.question) : ["Could we arrange a viewing before any payment?"],
        )}\n\nI'm happy to proceed once these are sorted out. I won't be sending any payment until then.${sign(ctx.senderName)}`,
      };
    case "request_viewing":
      return {
        subject: `Viewing request${prop}`,
        body: `${greet(ctx.recipientName)}\n\nI'm interested in the rental${prop}. Could we arrange an in-person viewing? If you're not available, a live video tour with someone who can show the unit and the building entrance would also work.\n\nI'll be able to discuss next steps after the viewing.${sign(ctx.senderName)}`,
      };
    case "verify_management":
      return {
        subject: `Owner / property manager information${prop}`,
        body: `${greet(ctx.recipientName)}\n\nCould you share the name of the owner or the property-management company for this unit? I'd like to confirm the rental through their publicly listed contact details before signing or paying anything — I do this for every rental I'm considering.${sign(ctx.senderName)}`,
      };
    case "clarify_deposit":
      return {
        subject: `Security deposit${prop}`,
        body: `${greet(ctx.recipientName)}\n\nCould you confirm the security deposit amount in writing? My understanding is that in Nova Scotia a security deposit can be at most half of one month's rent, and it is held in trust. ${qs.find((q) => q.purpose === "clarify_deposit")?.question ?? ""}${sign(ctx.senderName)}`,
      };
    case "clarify_fees":
      return {
        subject: `Fees${prop}`,
        body: `${greet(ctx.recipientName)}\n\nCould you list every amount you'd need from me before move-in, and what each one is for? I understand Nova Scotia doesn't allow application fees, and that any amount beyond rent is treated as part of the security deposit.${sign(ctx.senderName)}`,
      };
    case "rent_discrepancy":
      return {
        subject: `Monthly rent amount${prop}`,
        body: `${greet(ctx.recipientName)}\n\n${qs.find((q) => q.purpose === "rent_discrepancy")?.question ?? "I've seen different monthly rent amounts for this unit. Could you confirm the correct rent in writing?"}${sign(ctx.senderName)}`,
      };
    case "corrected_lease":
      return {
        subject: `Updated lease${prop}`,
        body: `${greet(ctx.recipientName)}\n\nCould you send an updated copy of the lease reflecting what we discussed? I'd like the rent, deposit, utilities and lease dates to match before I sign.${sign(ctx.senderName)}`,
      };
    case "utilities":
      return {
        subject: `Utilities${prop}`,
        body: `${greet(ctx.recipientName)}\n\nCould you confirm which utilities (heat, hot water, electricity, internet) are included in the rent, and make sure the lease states this?${sign(ctx.senderName)}`,
      };
    case "repair_followup":
      return {
        subject: `Follow-up: ${ctx.repair?.title ?? "repair request"}`,
        body: `${greet(ctx.recipientName)}\n\nI'm following up on the repair request for “${ctx.repair?.title ?? "the issue"}”${ctx.repair?.reportedOn ? `, which I reported on ${ctx.repair.reportedOn}` : ""}.${ctx.repair?.promisedBy ? ` It was expected to be completed by ${ctx.repair.promisedBy}.` : ""} Could you let me know when the repair will be done? I'm keeping a record of the issue with dated photos.${sign(ctx.senderName)}`,
      };
    case "deposit_return":
      return {
        subject: "Security deposit return",
        body: `${greet(ctx.recipientName)}\n\nMy tenancy ended${ctx.deposit?.tenancyEndedOn ? ` on ${ctx.deposit.tenancyEndedOn}` : ""}. Could you confirm when my security deposit${ctx.deposit?.amount ? ` of ${ctx.deposit.amount}` : ""} plus interest will be returned? My understanding is that it should be returned, or a claim filed with the Residential Tenancies Program, within 10 days of the tenancy ending${ctx.deposit?.deadline ? ` (${ctx.deposit.deadline})` : ""}.${sign(ctx.senderName)}`,
      };
  }
}
