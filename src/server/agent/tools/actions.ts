/**
 * Action-oriented tools. These only PROPOSE: drafts are never sent and
 * actions wait for explicit renter approval. verify_actions reports the real
 * state of each action (e.g. a provider acknowledgement), never assumes success.
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client";
import { investigation, investigationAction, messageDraft, monitoringJob } from "../../db/schema";
import { generateQuestions } from "../../investigation/questions";
import { headline } from "../../investigation/evaluate";
import { activeClaims, byType } from "../../investigation/active";
import { llm, wrapUntrusted } from "../../providers/llm";
import { redactText } from "../../security/redact";
import { createDraft } from "../../services/communications";
import { logEvent, proposeAction } from "../../services/investigations";
import type { FindingDraft } from "../../investigation/types";
import { hashOf, type AgentTool, type AgentState } from "./types";

function asDrafts(s: AgentState): FindingDraft[] {
  return s.activeFindings.map((f) => ({
    key: f.findingKey,
    category: f.category,
    label: f.label,
    severity: f.severity,
    title: f.title,
    explanation: f.explanation,
    recommendation: f.recommendation ?? undefined,
    claimIds: f.claimIds,
    evidenceIds: f.evidenceIds,
    requiresHumanReview: f.requiresHumanReview,
  }));
}

const findingsHash = (s: AgentState) => hashOf(s.activeFindings.map((f) => `${f.findingKey}:${f.severity}`).sort());

export const generateVerificationQuestions: AgentTool<object> = {
  name: "generate_verification_questions",
  label: "Verification questions",
  description: "Turns open findings into specific, polite questions for the landlord.",
  category: "action",
  mandatory: false,
  permission: "read_case",
  candidates(s) {
    if (s.activeFindings.length === 0) return [];
    return [{ inputHash: findingsHash(s), reason: "Open findings need answers from the landlord.", inputSummary: `${s.activeFindings.length} active finding(s)`, input: {} }];
  },
  async run(ctx, s) {
    const qs = generateQuestions(s.snapshot, asDrafts(s));
    s.latestQuestions = qs;
    return { status: "succeeded", mode: "DETERMINISTIC", summary: `${qs.length} verification question(s) prepared.`, output: { questions: qs } };
  },
};

export const prepareCommunication: AgentTool<{ questionKeys: string[] }> = {
  name: "prepare_communication",
  label: "Prepare landlord message",
  description: "Drafts a message with the most important questions for the renter to review, edit and approve. Never sends.",
  category: "action",
  mandatory: false,
  permission: "propose_action",
  candidates(s) {
    const qs = s.latestQuestions;
    if (!qs || qs.length === 0) return [];
    const keys = qs.slice(0, 4).map((q) => q.key);
    return [{ inputHash: hashOf(keys), reason: "Questions are ready; a draft saves the renter time.", inputSummary: keys.join(", "), input: { questionKeys: keys } }];
  },
  async run(ctx, s, input) {
    const qs = (s.latestQuestions ?? []).filter((q) => input.questionKeys.includes(q.key));
    const claims = activeClaims(s.snapshot);
    const contactName = byType(claims, "contact_name").sort((a, b) => b.value.length - a.value.length)[0]?.value ?? null;
    const contactEmail = byType(claims, "contact_email")[0]?.value ?? null;
    const address = byType(claims, "address")[0]?.value ?? null;
    const draft = await createDraft(ctx.userId, {
      purpose: "verification_questions",
      investigationId: s.inv.id,
      recipient: contactEmail,
      context: { recipientName: contactName, propertyLabel: address, questions: qs, senderName: ctx.userName },
      preferLlm: llm().configured() && ctx.llmCounter.used < ctx.llmCounter.max,
    });
    await proposeAction(s.inv.id, {
      key: `send_message:${hashOf(input.questionKeys)}`,
      type: "send_message",
      title: "Review and send verification questions",
      description: `A draft with ${qs.length} question(s) is ready in Communications. It will not be sent unless you approve it.`,
      messageDraftId: draft.id,
      runId: ctx.runId,
    });
    return { status: "succeeded", mode: draft.generatedBy === "llm" ? "LLM" : "DETERMINISTIC", summary: `Draft prepared (${draft.generatedBy === "llm" ? "AI-polished" : "template"}); awaiting your approval.${draft.note ? ` ${draft.note}` : ""}`, output: { draftId: draft.id } };
  },
};

export const caseMonitoring: AgentTool<object> = {
  name: "case_monitoring",
  label: "Case monitoring proposal",
  description: "Proposes a scheduled re-check of this case. Monitoring only runs when a scheduler is actually configured or run.",
  category: "action",
  mandatory: false,
  permission: "propose_action",
  candidates(s) {
    if (s.inv.status === "closed" || s.activeFindings.length === 0) return [];
    return [{ inputHash: hashOf(["monitor", s.inv.id]), reason: "Active case with open questions.", inputSummary: "once per case", input: {} }];
  },
  async run(ctx, s) {
    const [job] = await db.select({ id: monitoringJob.id }).from(monitoringJob).where(and(eq(monitoringJob.targetId, s.inv.id), eq(monitoringJob.jobType, "investigation_recheck")));
    if (job) return { status: "skipped", mode: "DETERMINISTIC", summary: "Monitoring is already set up for this case." };
    await proposeAction(s.inv.id, { key: "enable_monitoring", type: "enable_monitoring", title: "Turn on case monitoring", description: "Re-run checks every 24 hours and notify you of changes (requires the job runner or a configured scheduler).", runId: ctx.runId });
    return { status: "succeeded", mode: "DETERMINISTIC", summary: "Proposed enabling case monitoring (requires your approval)." };
  },
};

export const verifyActions: AgentTool<{ ids: string[] }> = {
  name: "verify_actions",
  label: "Action verification",
  description: "Checks the real outcome of approved actions (e.g. whether the email provider accepted a message) and records it.",
  category: "action",
  mandatory: true,
  permission: "read_case",
  candidates(s) {
    const pending = s.actions.filter((a) => ["approved", "submitted", "completed_by_user"].includes(a.status));
    if (pending.length === 0) return [];
    return [{ inputHash: hashOf(pending.map((a) => `${a.id}:${a.status}:${a.updatedAt.getTime()}`)), reason: "Approved actions need their real outcome confirmed.", inputSummary: `${pending.length} action(s)`, input: { ids: pending.map((a) => a.id) } }];
  },
  async run(ctx, s, input) {
    const actions = await db.select().from(investigationAction).where(inArray(investigationAction.id, input.ids));
    const drafts = await db.select().from(messageDraft).where(inArray(messageDraft.id, actions.map((a) => a.messageDraftId).filter((x): x is string => Boolean(x))));
    const notes: string[] = [];
    for (const a of actions) {
      const d = drafts.find((x) => x.id === a.messageDraftId);
      let note = a.verificationNote;
      if (a.actionType === "send_message" && d) {
        note =
          d.status === "submitted"
            ? `Email provider accepted the message (id ${d.providerMessageId}). Delivery and reading are not confirmed.`
            : d.status === "marked_sent_by_user"
              ? "You reported sending this message yourself. SafeLease cannot confirm delivery."
              : d.status === "failed"
                ? `Sending failed: ${d.providerError ?? "unknown error"}.`
                : "Approved but not sent yet.";
      } else if (a.actionType === "enable_monitoring") {
        const [job] = await db.select().from(monitoringJob).where(and(eq(monitoringJob.targetId, s.inv.id), eq(monitoringJob.jobType, "investigation_recheck")));
        note = job ? `Monitoring job is ${job.status}; last run: ${job.lastRunAt ? job.lastRunAt.toISOString().slice(0, 16).replace("T", " ") : "never"}.` : "Approved, but no monitoring job exists yet.";
      }
      if (note !== a.verificationNote) {
        await db.update(investigationAction).set({ verificationNote: note, updatedAt: new Date() }).where(eq(investigationAction.id, a.id));
        notes.push(`${a.title}: ${note}`);
      }
    }
    return { status: "succeeded", mode: "DETERMINISTIC", summary: notes.length ? notes.join(" ") : "No action status changes.", output: { verified: actions.length } };
  },
};

export const summarizeCase: AgentTool<object> = {
  name: "summarize_case",
  label: "Case summary",
  description: "Writes a short plain-language summary of findings and next steps (AI-written when an LLM is configured, otherwise rule-based).",
  category: "reporting",
  mandatory: false,
  permission: "write_case",
  candidates(s) {
    if (s.snapshot.evidence.length === 0) return [];
    return [{ inputHash: hashOf(["summary", findingsHash(s), s.inv.stateVersion]), reason: "Findings changed; refresh the summary.", inputSummary: `${s.activeFindings.length} finding(s)`, input: {} }];
  },
  async run(ctx, s) {
    const drafts = asDrafts(s);
    const h = headline(drafts);
    const top = drafts.filter((d) => d.severity !== "info").slice(0, 4).map((d) => d.title);
    let summary = `${h.text}${top.length ? ` Key items: ${top.join("; ")}.` : ""} Rental authority has not been independently verified unless shown otherwise in Verification.`;
    let mode: "DETERMINISTIC" | "LLM" = "DETERMINISTIC";
    if (llm().configured()) {
      const facts = drafts.map((d) => `- [${d.severity}/${d.label}] ${d.title}: ${redactText(d.explanation).slice(0, 300)}`).join("\n");
      const r = await llm().structured(
        { userId: ctx.userId, investigationId: s.inv.id, purpose: "summarize_case", callCounter: ctx.llmCounter },
        {
          system:
            "Write a calm, plain-language 2-4 sentence summary for a renter based ONLY on the findings provided. Do not add facts. Do not say the listing is safe, legitimate or a scam. Mention that unverified items remain unverified. End with the single most useful next step.",
          content: [{ type: "text", text: `Findings (system-generated, but may quote untrusted text):\n${wrapUntrusted("findings", facts, 8000)}` }],
          jsonSchema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"], additionalProperties: false },
          validator: z.object({ summary: z.string().min(20).max(1200) }),
          maxTokens: 600,
        },
      );
      if (r.ok && !/\b(is|looks|seems) (safe|legit(imate)?|a scam|fraudulent)\b/i.test(r.data.summary)) {
        summary = `${r.data.summary} (AI-written summary of the findings below.)`;
        mode = "LLM";
      }
    }
    await db.update(investigation).set({ summary, lastRunAt: new Date() }).where(eq(investigation.id, s.inv.id));
    await logEvent(s.inv.id, "summary_updated", "agent", "Case summary updated.");
    return { status: "succeeded", mode, summary: "Summary updated.", output: { tone: h.tone } };
  },
};
