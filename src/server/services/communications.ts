/**
 * Communication workspace: drafts (never sent automatically), user approval,
 * provider submission (status "submitted" only on provider acknowledgement),
 * recorded inbound/outbound history.
 */
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { communication, investigationAction, messageDraft } from "../db/schema";
import { newId } from "@/lib/ids";
import { AppError, notFound } from "../errors";
import { getEmailProvider } from "../providers/email";
import { llm, wrapUntrusted } from "../providers/llm";
import { renderTemplate, type DraftContext, type MessagePurpose } from "../communications/templates";
import { audit } from "./audit";
import { getInvestigationForUser, logEvent } from "./investigations";

export async function createDraft(
  ownerId: string,
  input: { purpose: MessagePurpose; investigationId?: string | null; maintenanceCaseId?: string | null; recipient?: string | null; context: DraftContext; preferLlm?: boolean; investigationContext?: string },
): Promise<{ id: string; generatedBy: "template" | "llm"; note: string | null }> {
  let { subject, body } = renderTemplate(input.purpose, input.context);
  let generatedBy: "template" | "llm" = "template";
  let note: string | null = null;

  if (input.preferLlm && llm().configured()) {
    const res = await llm().structured(
      { userId: ownerId, investigationId: input.investigationId ?? null, purpose: "draft_message" },
      {
        system:
          "You polish short messages from a renter to a landlord or property manager. Keep them polite, concise, specific and non-accusatory. Keep every factual statement and question from the template; do not add new facts, legal claims, amounts or promises. Never claim anything was verified.",
        content: [
          {
            type: "text",
            text: `Template draft to polish:\n${wrapUntrusted("template", `${subject}\n\n${body}`, 6000)}\n${input.investigationContext ? `Case context (data):\n${wrapUntrusted("case", input.investigationContext, 4000)}` : ""}\nReturn JSON with subject and body.`,
          },
        ],
        jsonSchema: { type: "object", properties: { subject: { type: "string" }, body: { type: "string" } }, required: ["subject", "body"], additionalProperties: false },
        validator: z.object({ subject: z.string().min(3).max(200), body: z.string().min(20).max(4000) }),
        maxTokens: 1200,
      },
    );
    const { makesCertaintyClaim } = await import("../agent/tools/actions");
    if (res.ok && makesCertaintyClaim(res.data.body)) {
      note = "AI wording was discarded because it asserted facts as verified; template used.";
    } else if (res.ok) {
      subject = res.data.subject;
      body = res.data.body;
      generatedBy = "llm";
    } else {
      note = `AI polishing unavailable (${res.message}); template used.`;
    }
  }

  const id = newId("drf");
  await db.insert(messageDraft).values({
    id,
    ownerId,
    investigationId: input.investigationId ?? null,
    maintenanceCaseId: input.maintenanceCaseId ?? null,
    purpose: input.purpose,
    subject,
    body,
    recipient: input.recipient ?? null,
    generatedBy,
  });
  if (input.investigationId) await logEvent(input.investigationId, "draft_created", "agent", `Message drafted for your review: “${subject.slice(0, 80)}”. Nothing has been sent.`, { draftId: id });
  return { id, generatedBy, note };
}

export async function getOwnedDraft(ownerId: string, id: string) {
  const [d] = await db.select().from(messageDraft).where(and(eq(messageDraft.id, id), eq(messageDraft.ownerId, ownerId)));
  if (!d) throw notFound("Draft");
  return d;
}

export async function listDrafts(ownerId: string, investigationId?: string) {
  const where = investigationId ? and(eq(messageDraft.ownerId, ownerId), eq(messageDraft.investigationId, investigationId)) : eq(messageDraft.ownerId, ownerId);
  return db.select().from(messageDraft).where(where).orderBy(desc(messageDraft.updatedAt)).limit(100);
}

export async function updateDraft(ownerId: string, id: string, patch: { subject?: string; body?: string; recipient?: string | null }) {
  const d = await getOwnedDraft(ownerId, id);
  if (d.status === "submitted") throw new AppError("CONFLICT", "This message was already submitted for delivery and can't be edited.");
  await db
    .update(messageDraft)
    .set({ ...patch, status: d.status === "approved" ? "draft" : d.status, approvedAt: d.status === "approved" ? null : d.approvedAt, updatedAt: new Date() })
    .where(eq(messageDraft.id, id));
}

export async function approveDraft(ownerId: string, id: string) {
  const d = await getOwnedDraft(ownerId, id);
  await db.update(messageDraft).set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() }).where(eq(messageDraft.id, id));
  if (d.investigationId) {
    await db.update(investigationAction).set({ status: "approved", updatedAt: new Date() }).where(and(eq(investigationAction.messageDraftId, id), eq(investigationAction.status, "proposed")));
    await logEvent(d.investigationId, "draft_approved", "user", `You approved the message “${d.subject.slice(0, 80)}”. It has not been sent.`);
  }
}

export async function markCopied(ownerId: string, id: string) {
  const d = await getOwnedDraft(ownerId, id);
  if (d.status === "draft" || d.status === "approved") await db.update(messageDraft).set({ status: "copied", updatedAt: new Date() }).where(eq(messageDraft.id, id));
}

/** The renter says they sent it themselves (e.g. via the rental platform). */
export async function markSentByUser(ownerId: string, id: string) {
  const d = await getOwnedDraft(ownerId, id);
  await db.update(messageDraft).set({ status: "marked_sent_by_user", updatedAt: new Date() }).where(eq(messageDraft.id, id));
  await db.insert(communication).values({
    id: newId("com"),
    ownerId,
    investigationId: d.investigationId,
    maintenanceCaseId: d.maintenanceCaseId,
    direction: "outbound",
    channel: "other",
    counterpartContact: d.recipient,
    body: `${d.subject}\n\n${d.body}`,
    occurredAt: new Date(),
    messageDraftId: d.id,
  });
  if (d.investigationId) {
    await db.update(investigationAction).set({ status: "completed_by_user", completedAt: new Date(), verificationNote: "Renter reports sending this message themselves.", updatedAt: new Date() }).where(eq(investigationAction.messageDraftId, id));
    await logEvent(d.investigationId, "message_sent_by_user", "user", `You recorded sending “${d.subject.slice(0, 80)}” yourself. SafeLease did not send it.`);
  }
}

/** Send through the configured provider. Requires prior explicit approval. */
export async function sendApprovedDraft(ownerId: string, id: string) {
  const d = await getOwnedDraft(ownerId, id);
  if (d.status !== "approved") throw new AppError("CONFLICT", "Approve the message before sending.");
  if (!d.recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.recipient)) throw new AppError("VALIDATION", "Add a valid recipient email address.");
  const provider = getEmailProvider();
  const result = await provider.send({ to: d.recipient, subject: d.subject, text: d.body });
  if (result.outcome === "submitted") {
    await db.update(messageDraft).set({ status: "submitted", providerId: result.providerId, providerMessageId: result.providerMessageId, submittedAt: new Date(), updatedAt: new Date() }).where(eq(messageDraft.id, id));
    await db.insert(communication).values({ id: newId("com"), ownerId, investigationId: d.investigationId, maintenanceCaseId: d.maintenanceCaseId, direction: "outbound", channel: "email", counterpartContact: d.recipient, body: `${d.subject}\n\n${d.body}`, occurredAt: new Date(), messageDraftId: d.id });
    if (d.investigationId) {
      await db.update(investigationAction).set({ status: "submitted", verificationNote: `Provider ${result.providerId} accepted the message (id ${result.providerMessageId}). Acceptance is not proof of delivery or reading.`, updatedAt: new Date() }).where(eq(investigationAction.messageDraftId, id));
      await logEvent(d.investigationId, "message_submitted", "system", `Email accepted by ${result.providerId} for delivery (provider id ${result.providerMessageId}).`);
    }
    await audit({ actorId: ownerId, action: "message.submitted", resourceType: "message_draft", resourceId: id, metadata: { provider: result.providerId } });
    return { outcome: "submitted" as const, message: "Accepted by the email provider for delivery." };
  }
  if (result.outcome === "logged_not_delivered") {
    return { outcome: "not_delivered" as const, message: "DEMO email provider: the message was written to the server log and was NOT delivered. Copy it and send it yourself." };
  }
  if (result.outcome === "not_configured") {
    return { outcome: "not_configured" as const, message: "Email sending isn't configured. Copy the message and send it yourself." };
  }
  await db.update(messageDraft).set({ status: "failed", providerError: result.error, updatedAt: new Date() }).where(eq(messageDraft.id, id));
  return { outcome: "failed" as const, message: `Sending failed: ${result.error} Nothing was sent.` };
}

export async function deleteDraft(ownerId: string, id: string) {
  await getOwnedDraft(ownerId, id);
  await db.delete(messageDraft).where(eq(messageDraft.id, id));
}

export async function listCommunications(ownerId: string, investigationId: string) {
  await getInvestigationForUser(ownerId, investigationId);
  return db.select().from(communication).where(and(eq(communication.ownerId, ownerId), eq(communication.investigationId, investigationId))).orderBy(desc(communication.occurredAt));
}
