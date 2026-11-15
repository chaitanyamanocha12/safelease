"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "./helpers";
import * as comms from "../services/communications";

const rv = (investigationId?: string | null) => {
  if (investigationId) revalidatePath(`/investigations/${investigationId}`, "layout");
  revalidatePath("/maintenance", "layout");
};

export const updateDraftAction = action(z.object({ id: z.string(), subject: z.string().min(1).max(200), body: z.string().min(1).max(8000), recipient: z.string().max(200).optional() }), async (u, v) => {
  await comms.updateDraft(u.id, v.id, { subject: v.subject, body: v.body, recipient: v.recipient || null });
  const d = await comms.getOwnedDraft(u.id, v.id);
  rv(d.investigationId);
  return null;
});
export const approveDraftAction = action(z.object({ id: z.string() }), async (u, v) => {
  await comms.approveDraft(u.id, v.id);
  rv((await comms.getOwnedDraft(u.id, v.id)).investigationId);
  return null;
});
export const copiedDraftAction = action(z.object({ id: z.string() }), async (u, v) => {
  await comms.markCopied(u.id, v.id);
  return null;
});
export const markSentAction = action(z.object({ id: z.string() }), async (u, v) => {
  await comms.markSentByUser(u.id, v.id);
  rv((await comms.getOwnedDraft(u.id, v.id)).investigationId);
  return null;
});
export const sendDraftAction = action(
  z.object({ id: z.string() }),
  async (u, v) => {
    const r = await comms.sendApprovedDraft(u.id, v.id);
    rv((await comms.getOwnedDraft(u.id, v.id)).investigationId);
    return r;
  },
  { rateLimit: { key: "send", max: 10, windowMs: 3600_000 } },
);
export const deleteDraftAction = action(z.object({ id: z.string() }), async (u, v) => {
  const d = await comms.getOwnedDraft(u.id, v.id);
  await comms.deleteDraft(u.id, v.id);
  rv(d.investigationId);
  return null;
});
