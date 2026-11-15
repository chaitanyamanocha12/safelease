/**
 * Planner. Mandatory deterministic tools always run when relevant.
 * Optional tools are ordered/selected by the LLM when configured; the LLM can
 * only choose from currently relevant candidates (it cannot invent tools or
 * inputs) and its output is schema-validated. On any failure the
 * deterministic planner is used and the reason is recorded.
 */
import { z } from "zod";
import { llm, wrapUntrusted } from "../providers/llm";
import { redactText } from "../security/redact";
import type { AgentState, AgentTool, ToolCandidate, ToolContext } from "./tools/types";

export interface PlannedStep {
  tool: AgentTool<unknown>;
  candidate: ToolCandidate<unknown>;
  reason: string;
}
export interface Plan {
  steps: PlannedStep[];
  skipped: Array<PlannedStep & { skipReason: string }>;
  mode: "llm" | "deterministic";
  note: string | null;
}

export function deterministicPlan(cands: Array<{ tool: AgentTool<unknown>; candidate: ToolCandidate<unknown> }>): Plan {
  return { steps: cands.map((c) => ({ ...c, reason: c.candidate.reason })), skipped: [], mode: "deterministic", note: null };
}

function describeState(s: AgentState): string {
  const claimTypes = [...new Set(s.snapshot.claims.filter((c) => !c.supersededAt).map((c) => c.claimType))];
  const lines = [
    `Evidence items: ${s.snapshot.evidence.length} (${[...new Set(s.snapshot.evidence.map((e) => e.kind))].join(", ") || "none"})`,
    `Claim types present: ${claimTypes.join(", ") || "none"}`,
    `Verification checks: ${[...s.checks.values()].map((c) => `${c.checkType}=${c.status}`).join(", ") || "none yet"}`,
    `Active findings: ${s.activeFindings.map((f) => `[${f.severity}] ${redactText(f.title, { addresses: true })}`).join("; ") || "none"}`,
  ];
  return lines.join("\n");
}

const planSchema = z.object({
  selected: z.array(z.object({ tool: z.string(), reason: z.string().max(300) })).max(20),
  skipped: z.array(z.object({ tool: z.string(), reason: z.string().max(300) })).max(20),
});

export async function planOptional(ctx: ToolContext, state: AgentState, optional: Array<{ tool: AgentTool<unknown>; candidate: ToolCandidate<unknown> }>): Promise<Plan> {
  if (optional.length === 0) return { steps: [], skipped: [], mode: llm().configured() ? "llm" : "deterministic", note: null };
  if (!llm().configured()) return deterministicPlan(optional);
  const names = [...new Set(optional.map((o) => o.tool.name))];
  const res = await llm().structured(
    { userId: ctx.userId, investigationId: state.inv.id, purpose: "plan_investigation", callCounter: ctx.llmCounter },
    {
      system:
        "You plan the next steps of a bounded rental investigation for a renter in Nova Scotia. Choose which OPTIONAL tools are worth running now, in priority order, and which to skip, with a one-sentence reason each. Prefer tools that resolve the most important open questions. Skip tools unlikely to add information. You may only use the listed tool names.",
      content: [
        {
          type: "text",
          text: `Case state (system-generated summary; finding titles may quote untrusted text):\n${wrapUntrusted("case_state", describeState(state), 6000)}\n\nCandidate optional tools:\n${optional
            .map((o) => `- ${o.tool.name}: ${o.tool.description} | why relevant: ${o.candidate.reason}`)
            .join("\n")}\n\nReturn JSON.`,
        },
      ],
      jsonSchema: {
        type: "object",
        properties: {
          selected: { type: "array", items: { type: "object", properties: { tool: { type: "string", enum: names }, reason: { type: "string" } }, required: ["tool", "reason"], additionalProperties: false } },
          skipped: { type: "array", items: { type: "object", properties: { tool: { type: "string", enum: names }, reason: { type: "string" } }, required: ["tool", "reason"], additionalProperties: false } },
        },
        required: ["selected", "skipped"],
        additionalProperties: false,
      },
      validator: planSchema,
      maxTokens: 1200,
      effort: "low",
    },
  );
  if (!res.ok) {
    const p = deterministicPlan(optional);
    p.note = `LLM planner unavailable (${res.message}); deterministic plan used.`;
    return p;
  }
  const steps: PlannedStep[] = [];
  const used = new Set<number>();
  for (const sel of res.data.selected) {
    optional.forEach((o, i) => {
      if (o.tool.name === sel.tool && !used.has(i)) {
        used.add(i);
        steps.push({ ...o, reason: sel.reason });
      }
    });
  }
  const skipped: Plan["skipped"] = [];
  optional.forEach((o, i) => {
    if (used.has(i)) return;
    const sk = res.data.skipped.find((x) => x.tool === o.tool.name);
    if (sk) skipped.push({ ...o, reason: o.candidate.reason, skipReason: sk.reason });
    else steps.push({ ...o, reason: `${o.candidate.reason} (not addressed by planner; run by default)` });
  });
  return { steps, skipped, mode: "llm", note: `AI planner selected ${steps.length} optional step(s) and skipped ${skipped.length}.` };
}
