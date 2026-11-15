"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "./helpers";
import { savePrepayment } from "../services/prepayment";
import { grantConsent, revokeConsent } from "../services/organizations";
import { parseMoneyToCents } from "@/lib/money";

export const savePrepaymentAction = action(
  z.object({
    investigationId: z.string(),
    amount: z.string().max(20).optional(),
    purpose: z.enum(["security_deposit", "first_month_rent", "application_fee", "holding_fee", "other"]).optional(),
    paymentMethod: z.string().max(60).optional(),
    recipientName: z.string().max(120).optional(),
    dueBy: z.string().max(20).optional(),
    leaseSigned: z.enum(["yes", "no", "unknown"]).optional(),
    viewedInPerson: z.enum(["yes", "no", "unknown"]).optional(),
    checklist: z.record(z.string(), z.boolean()).optional(),
  }),
  async (u, v) => {
    const tri = (x?: string) => (x === "yes" ? true : x === "no" ? false : null);
    const r = await savePrepayment(u.id, v.investigationId, {
      requestedAmountCents: v.amount ? parseMoneyToCents(v.amount) : null,
      purpose: v.purpose ?? null,
      paymentMethod: v.paymentMethod || null,
      recipientName: v.recipientName || null,
      dueBy: v.dueBy || null,
      leaseSigned: tri(v.leaseSigned),
      viewedInPerson: tri(v.viewedInPerson),
      checklist: v.checklist ?? {},
    });
    revalidatePath(`/investigations/${v.investigationId}/verification`);
    return r;
  },
);

export const shareCaseAction = action(
  z.object({ investigationId: z.string(), orgId: z.string(), scope: z.enum(["redacted", "full"]), message: z.string().max(1000).optional(), confirm: z.literal(true, { message: "Please confirm you want to share this case." }) }),
  async (u, v) => {
    await grantConsent(u.id, { orgId: v.orgId, investigationId: v.investigationId, scope: v.scope, message: v.message });
    revalidatePath(`/investigations/${v.investigationId}/verification`);
    revalidatePath("/settings/privacy");
    return null;
  },
);

export const revokeShareAction = action(z.object({ grantId: z.string(), investigationId: z.string().optional() }), async (u, v) => {
  await revokeConsent(u.id, v.grantId);
  if (v.investigationId) revalidatePath(`/investigations/${v.investigationId}/verification`);
  revalidatePath("/settings/privacy");
  return null;
});
