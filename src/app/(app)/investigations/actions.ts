"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireApiUser } from "@/server/auth/session";
import { AppError, toActionError, type ActionResult } from "@/server/errors";
import { EVIDENCE_KINDS } from "@/server/db/schema/investigations";
import { MAX_FILES_PER_REQUEST, validateUpload } from "@/server/security/upload";
import { rateLimit } from "@/server/security/rate-limit";
import * as inv from "@/server/services/investigations";
import { createAgentRun, executeAgentRun, requestCancel } from "@/server/agent/orchestrator";
import { action } from "@/server/actions/helpers";
import { upsertCheck } from "@/server/services/investigations";
import { createDraft } from "@/server/services/communications";
import { MESSAGE_PURPOSES } from "@/server/communications/templates";
import { db } from "@/server/db/client";
import { monitoringJob } from "@/server/db/schema";
import { newId } from "@/lib/ids";
import { and, eq } from "drizzle-orm";

async function startRunInBackground(userId: string, investigationId: string, trigger: "manual" | "new_evidence" | "correction") {
  const { runId, reused } = await createAgentRun(userId, investigationId, { trigger });
  if (!reused) {
    after(async () => {
      try {
        await executeAgentRun(runId);
      } catch (err) {
        console.error("[safelease] background run error", err instanceof Error ? err.message : err);
      }
    });
  }
  return runId;
}

export async function createInvestigationAction(fd: FormData) {
  const user = await requireApiUser();
  const title = String(fd.get("title") ?? "").trim() || "Untitled rental";
  const city = String(fd.get("city") ?? "").trim() || null;
  const id = await inv.createInvestigation(user.id, { title, city });
  redirect(`/investigations/${id}/evidence?new=1`);
}

const textEvidence = z.object({
  investigationId: z.string().min(3),
  kind: z.enum(EVIDENCE_KINDS),
  title: z.string().trim().min(1, "Give this evidence a short title.").max(160),
  text: z.string().max(200_000).optional(),
  sourceUrl: z.string().url("Enter a full link starting with https://").max(2000).optional().or(z.literal("")),
  occurredAt: z.string().optional(),
  supersedesEvidenceId: z.string().optional().or(z.literal("")),
  autoRun: z.string().optional(),
});

/** Accepts pasted text, a URL and/or files (multipart FormData). */
export async function addEvidenceAction(fd: FormData): Promise<ActionResult<{ evidenceIds: string[]; runId: string | null }>> {
  try {
    const user = await requireApiUser();
    rateLimit(`evidence:${user.id}`, 40, 60_000);
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > MAX_FILES_PER_REQUEST) throw new AppError("VALIDATION", `Upload at most ${MAX_FILES_PER_REQUEST} files at once.`);
    const parsed = textEvidence.safeParse({
      investigationId: fd.get("investigationId"),
      kind: fd.get("kind"),
      title: fd.get("title"),
      text: fd.get("text") || undefined,
      sourceUrl: fd.get("sourceUrl") || undefined,
      occurredAt: fd.get("occurredAt") || undefined,
      supersedesEvidenceId: fd.get("supersedesEvidenceId") || undefined,
      autoRun: fd.get("autoRun") || undefined,
    });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) fe[i.path.join(".")] = i.message;
      throw new AppError("VALIDATION", "Please check the highlighted fields.", { fieldErrors: fe });
    }
    const v = parsed.data;
    if (!v.text && !v.sourceUrl && files.length === 0) throw new AppError("VALIDATION", "Paste text, add a link, or upload a file.");
    const occurredAt = v.occurredAt ? new Date(v.occurredAt) : null;
    const ids: string[] = [];
    if (files.length === 0) {
      ids.push(await inv.addEvidence(user.id, v.investigationId, { kind: v.kind, title: v.title, text: v.text, sourceUrl: v.sourceUrl || null, occurredAt, supersedesEvidenceId: v.supersedesEvidenceId || null }));
    } else {
      for (const [i, f] of files.entries()) {
        const upload = await validateUpload(f);
        const kind = v.kind === "property_photo" || upload.kind === "pdf" || upload.kind === "text" || v.kind !== "listing_text" ? v.kind : "listing_screenshot";
        ids.push(
          await inv.addEvidence(user.id, v.investigationId, {
            kind,
            title: files.length > 1 ? `${v.title} (${i + 1})` : v.title,
            text: i === 0 ? v.text : null,
            file: upload,
            sourceUrl: v.sourceUrl || null,
            occurredAt,
            supersedesEvidenceId: i === 0 ? v.supersedesEvidenceId || null : null,
          }),
        );
      }
    }
    const runId = v.autoRun === "false" ? null : await startRunInBackground(user.id, v.investigationId, "new_evidence");
    revalidatePath(`/investigations/${v.investigationId}`, "layout");
    return { ok: true, data: { evidenceIds: ids, runId } };
  } catch (err) {
    return toActionError(err);
  }
}

export const runInvestigationAction = action(z.object({ investigationId: z.string() }), async (user, { investigationId }) => {
  const runId = await startRunInBackground(user.id, investigationId, "manual");
  return { runId };
}, { rateLimit: { key: "run", max: 20, windowMs: 60_000 } });

export const cancelRunAction = action(z.object({ runId: z.string() }), async (user, { runId }) => {
  await requestCancel(user.id, runId);
  return null;
});

export const correctClaimAction = action(z.object({ claimId: z.string(), value: z.string().min(1).max(300), note: z.string().max(300).optional() }), async (user, v) => {
  const r = await inv.correctClaim(user.id, v.claimId, v.value, v.note);
  await startRunInBackground(user.id, r.investigationId, "correction");
  revalidatePath(`/investigations/${r.investigationId}`, "layout");
  return r;
});

export const reviewFindingAction = action(
  z.object({ findingId: z.string(), investigationId: z.string(), decision: z.enum(["confirmed", "disputed", "dismissed", "reopen"]), note: z.string().max(500).optional() }),
  async (user, v) => {
    await inv.reviewFinding(user.id, v.findingId, v.decision, v.note);
    revalidatePath(`/investigations/${v.investigationId}`, "layout");
    return null;
  },
);

export const updateInvestigationAction = action(
  z.object({ investigationId: z.string(), title: z.string().min(1).max(140).optional(), status: z.enum(["draft", "active", "awaiting_info", "closed"]).optional() }),
  async (user, v) => {
    await inv.updateInvestigation(user.id, v.investigationId, { title: v.title, status: v.status });
    revalidatePath(`/investigations/${v.investigationId}`, "layout");
    revalidatePath("/investigations");
    return null;
  },
);

export async function deleteInvestigationAction(investigationId: string) {
  const user = await requireApiUser();
  await inv.deleteInvestigation(user.id, investigationId);
  revalidatePath("/investigations");
  redirect("/investigations?deleted=1");
}

const USER_CHECKS = ["rental_authority", "independent_contact", "viewing_confirmed", "payment_recipient_consistency", "lease_matches_listing"] as const;

export const recordVerificationAction = action(
  z.object({
    investigationId: z.string(),
    checkType: z.enum(USER_CHECKS),
    status: z.enum(["supported", "contradicted", "unverified", "not_applicable"]),
    method: z.string().trim().min(3, "Describe how you checked.").max(300),
    note: z.string().max(1000).optional(),
  }),
  async (user, v) => {
    await inv.getInvestigationForUser(user.id, v.investigationId);
    await upsertCheck(v.investigationId, v.checkType, {
      status: v.status,
      method: `Renter-reported: ${v.method}`,
      summary: v.note ? `${v.method} — ${v.note}` : v.method,
      performedBy: "user",
      providerMode: "USER",
      note: v.note,
    });
    await inv.logEvent(v.investigationId, "verification_recorded", "user", `You recorded ${v.checkType.replace(/_/g, " ")} as ${v.status.replace("_", " ")} (${v.method.slice(0, 80)}).`);
    await startRunInBackground(user.id, v.investigationId, "correction");
    revalidatePath(`/investigations/${v.investigationId}`, "layout");
    return null;
  },
);

export const actionStatusAction = action(
  z.object({ actionId: z.string(), investigationId: z.string(), status: z.enum(["approved", "dismissed", "completed_by_user"]), note: z.string().max(500).optional() }),
  async (user, v) => {
    await inv.setActionStatus(user.id, v.actionId, v.status, v.note);
    revalidatePath(`/investigations/${v.investigationId}`, "layout");
    return null;
  },
);

export const enableMonitoringAction = action(z.object({ investigationId: z.string(), actionId: z.string().optional() }), async (user, v) => {
  await inv.getInvestigationForUser(user.id, v.investigationId);
  const [existing] = await db.select().from(monitoringJob).where(and(eq(monitoringJob.targetId, v.investigationId), eq(monitoringJob.jobType, "investigation_recheck")));
  if (!existing) {
    await db.insert(monitoringJob).values({ id: newId("job"), ownerId: user.id, jobType: "investigation_recheck", targetType: "investigation", targetId: v.investigationId, intervalHours: 24, nextRunAt: new Date(Date.now() + 24 * 3600_000) });
  }
  if (v.actionId) await inv.setActionStatus(user.id, v.actionId, "approved", "Monitoring job created. It runs only when the job runner or a configured scheduler executes it.");
  await inv.logEvent(v.investigationId, "monitoring_enabled", "user", "Case monitoring enabled (24h). Runs require the job runner or a configured scheduler.");
  revalidatePath(`/investigations/${v.investigationId}`, "layout");
  return null;
});

export const createDraftAction = action(
  z.object({ investigationId: z.string(), purpose: z.enum(MESSAGE_PURPOSES), recipient: z.string().max(200).optional(), useAi: z.boolean().optional() }),
  async (user, v) => {
    const i = await inv.getInvestigationForUser(user.id, v.investigationId);
    const snapshot = await inv.loadSnapshot(i.id);
    const { evaluateCase } = await import("@/server/investigation/evaluate");
    const { loadRuleLookup } = await import("@/server/legal/engine");
    const ev = evaluateCase(snapshot, await loadRuleLookup(db));
    const name = snapshot.claims.find((c) => c.claimType === "contact_name" && !c.supersededAt)?.value;
    const addr = snapshot.claims.find((c) => c.claimType === "address" && !c.supersededAt)?.value;
    const d = await createDraft(user.id, {
      purpose: v.purpose,
      investigationId: i.id,
      recipient: v.recipient || snapshot.claims.find((c) => c.claimType === "contact_email" && !c.supersededAt)?.value || null,
      context: { recipientName: name, propertyLabel: addr, questions: ev.questions, senderName: user.name },
      preferLlm: v.useAi,
    });
    revalidatePath(`/investigations/${i.id}/communications`);
    return d;
  },
);
