/**
 * Investigation orchestrator — a bounded agent loop:
 *   observe → plan → select tools → execute → reconcile → evaluate → act (propose) → verify → persist
 *
 * Guarantees: max iterations, max tool calls, per-tool timeout, cancellation,
 * idempotent tool runs (tool + input hash), one active run per case, no
 * outgoing actions without approval, and full audit of every tool run.
 */
import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "../db/client";
import {
  agentRun,
  evidence,
  finding,
  imageFingerprint,
  investigation,
  investigationAction,
  toolRun,
  user,
  verificationCheck,
} from "../db/schema";
import { newId } from "@/lib/ids";
import { env } from "../env";
import { AppError, notFound } from "../errors";
import { llm } from "../providers/llm";
import { withTimeout } from "../providers/http";
import { loadRuleLookup } from "../legal/engine";
import { bumpState, getInvestigationForUser, loadSnapshot, logEvent, persistEvaluation } from "../services/investigations";
import type { FindingDraft } from "../investigation/types";
import type { VerificationQuestion } from "../investigation/types";
import { PHASES, TOOLS } from "./registry";
import { planOptional, deterministicPlan, type Plan } from "./planner";
import type { AgentState, AgentTool, ToolCandidate, ToolContext, ToolOutcome } from "./tools/types";

const DONE_STATUSES = ["succeeded", "skipped", "not_configured", "provider_unavailable"] as const;
const STALE_RUN_MS = 5 * 60 * 1000;

export async function loadAgentState(invId: string, latestQuestions: VerificationQuestion[] | null = null): Promise<AgentState> {
  const [inv] = await db.select().from(investigation).where(eq(investigation.id, invId));
  if (!inv) throw notFound("Investigation");
  const [snapshot, evidenceRows, checks, activeFindings, done, actions] = await Promise.all([
    loadSnapshot(invId),
    db.select().from(evidence).where(eq(evidence.investigationId, invId)),
    db.select().from(verificationCheck).where(eq(verificationCheck.investigationId, invId)),
    db.select().from(finding).where(and(eq(finding.investigationId, invId), eq(finding.lifecycle, "active"))),
    db.select({ tool: toolRun.tool, hash: toolRun.inputHash }).from(toolRun).where(and(eq(toolRun.investigationId, invId), inArray(toolRun.status, [...DONE_STATUSES]))),
    db.select().from(investigationAction).where(eq(investigationAction.investigationId, invId)),
  ]);
  const versionIds = evidenceRows.filter((e) => e.documentVersionId && (e.kind === "property_photo" || e.kind === "listing_screenshot")).map((e) => e.documentVersionId!);
  const fps = versionIds.length ? await db.select().from(imageFingerprint).where(inArray(imageFingerprint.documentVersionId, versionIds)) : [];
  return {
    inv,
    snapshot,
    evidenceRows,
    checks: new Map(checks.map((c) => [c.checkType, c])),
    activeFindings,
    fingerprints: fps.map((f) => ({ ...f, evidenceId: evidenceRows.find((e) => e.documentVersionId === f.documentVersionId)!.id })),
    completed: new Set(done.map((d) => `${d.tool}|${d.hash}`)),
    actions,
    latestQuestions,
  };
}

function pendingCandidates(state: AgentState, tools: AgentTool<unknown>[], attempted: Set<string>) {
  const out: Array<{ tool: AgentTool<unknown>; candidate: ToolCandidate<unknown> }> = [];
  for (const tool of tools) {
    for (const candidate of tool.candidates(state)) {
      const k = `${tool.name}|${candidate.inputHash}`;
      if (state.completed.has(k) || attempted.has(k)) continue;
      out.push({ tool, candidate });
    }
  }
  return out;
}

export interface StartRunOptions {
  trigger: "manual" | "new_evidence" | "correction" | "scheduled" | "demo_seed";
  idempotencyKey?: string;
}

/** Creates (or reuses) a run record. Execution happens in executeAgentRun. */
export async function createAgentRun(userId: string, investigationId: string, opts: StartRunOptions): Promise<{ runId: string; reused: boolean }> {
  await getInvestigationForUser(userId, investigationId);
  if (opts.idempotencyKey) {
    const [existing] = await db.select({ id: agentRun.id }).from(agentRun).where(eq(agentRun.idempotencyKey, opts.idempotencyKey));
    if (existing) return { runId: existing.id, reused: true };
  }
  // One active run per case; stale runs (crashed process) are marked failed.
  const active = await db
    .select()
    .from(agentRun)
    .where(and(eq(agentRun.investigationId, investigationId), inArray(agentRun.status, ["queued", "running"])));
  for (const r of active) {
    if (Date.now() - r.startedAt.getTime() > STALE_RUN_MS) {
      await db.update(agentRun).set({ status: "failed", error: "Run did not finish (process stopped). Start a new run.", finishedAt: new Date() }).where(eq(agentRun.id, r.id));
    } else {
      return { runId: r.id, reused: true };
    }
  }
  const e = env();
  const runId = newId("run");
  await db.insert(agentRun).values({
    id: runId,
    investigationId,
    trigger: opts.trigger,
    status: "queued",
    plannerMode: llm().configured() ? "llm" : "deterministic",
    maxIterations: e.AGENT_MAX_ITERATIONS,
    maxToolCalls: e.AGENT_MAX_TOOL_CALLS,
    idempotencyKey: opts.idempotencyKey ?? null,
  });
  return { runId, reused: false };
}

export async function requestCancel(userId: string, runId: string) {
  const [r] = await db.select().from(agentRun).where(eq(agentRun.id, runId));
  if (!r) throw notFound("Run");
  await getInvestigationForUser(userId, r.investigationId);
  if (r.status !== "queued" && r.status !== "running") throw new AppError("CONFLICT", "This run has already finished.");
  await db.update(agentRun).set({ cancelRequested: true }).where(eq(agentRun.id, runId));
}

async function isCancelled(runId: string) {
  const [r] = await db.select({ c: agentRun.cancelRequested }).from(agentRun).where(eq(agentRun.id, runId));
  return Boolean(r?.c);
}

const SEVERITY_ORDER = { serious: 0, caution: 1, info: 2 } as const;

export async function executeAgentRun(runId: string): Promise<void> {
  const [run] = await db.select().from(agentRun).where(eq(agentRun.id, runId));
  if (!run || run.status !== "queued") return;
  const [inv] = await db.select().from(investigation).where(eq(investigation.id, run.investigationId));
  if (!inv) return;
  const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, inv.ownerId));

  await db.update(agentRun).set({ status: "running", stateVersionAtStart: inv.stateVersion }).where(eq(agentRun.id, runId));
  await logEvent(inv.id, "agent_run_started", "agent", `Investigation run started (${run.plannerMode === "llm" ? "AI-assisted planning" : "deterministic engine"}).`, { runId });

  const controller = new AbortController();
  const ctx: ToolContext = {
    runId,
    userId: inv.ownerId,
    userName: owner?.name ?? "",
    iteration: 0,
    rules: await loadRuleLookup(db),
    llmCounter: { used: 0, max: env().LLM_MAX_CALLS_PER_RUN },
    signal: controller.signal,
    evaluation: { findings: [], links: [], contradicted: new Set(), ran: new Set() },
  };
  const attempted = new Set<string>();
  let toolCalls = 0;
  let iterations = 0;
  let finalStatus: "completed" | "stopped_budget" | "cancelled" | "failed" = "completed";
  let latestQuestions: VerificationQuestion[] | null = null;
  const plannerNotes: string[] = [];
  let errorMsg: string | null = null;

  const execute = async (tool: AgentTool<unknown>, candidate: ToolCandidate<unknown>, reason: string, state: AgentState): Promise<"ok" | "stop"> => {
    if (await isCancelled(runId)) {
      finalStatus = "cancelled";
      return "stop";
    }
    if (toolCalls >= run.maxToolCalls) {
      finalStatus = "stopped_budget";
      await db.insert(toolRun).values({ id: newId("tr"), agentRunId: runId, investigationId: inv.id, iteration: ctx.iteration, tool: tool.name, status: "budget_exceeded", mode: "NONE", reason, inputHash: candidate.inputHash, inputSummary: candidate.inputSummary.slice(0, 300), finishedAt: new Date(), durationMs: 0 });
      return "stop";
    }
    const key = `${tool.name}|${candidate.inputHash}`;
    attempted.add(key);
    toolCalls++;
    const trId = newId("tr");
    const started = Date.now();
    await db.insert(toolRun).values({ id: trId, agentRunId: runId, investigationId: inv.id, iteration: ctx.iteration, tool: tool.name, status: "running", mode: "NONE", reason: reason.slice(0, 400), inputHash: candidate.inputHash, inputSummary: candidate.inputSummary.slice(0, 300) });
    await db.update(agentRun).set({ toolCalls, iterations }).where(eq(agentRun.id, runId));
    let outcome: ToolOutcome;
    try {
      outcome = await withTimeout(tool.run(ctx, state, candidate.input), env().AGENT_TOOL_TIMEOUT_MS * (tool.category === "extraction" ? 3 : 1), tool.label);
    } catch (err) {
      outcome = { status: "failed", mode: "NONE", summary: err instanceof Error ? err.message.slice(0, 200) : "Tool failed." };
    }
    await db
      .update(toolRun)
      .set({ status: outcome.status, mode: outcome.mode, output: { summary: outcome.summary, ...(outcome.output ?? {}) }, error: outcome.status === "failed" ? outcome.summary : null, finishedAt: new Date(), durationMs: Date.now() - started })
      .where(eq(toolRun.id, trId));
    if (outcome.stateChanged && tool.category !== "extraction" && tool.category !== "ingestion") await bumpState(inv.id);
    if (tool.name === "generate_verification_questions") latestQuestions = (outcome.output?.questions as VerificationQuestion[]) ?? null;
    return "ok";
  };

  try {
    outer: for (iterations = 1; iterations <= run.maxIterations; iterations++) {
      ctx.iteration = iterations;
      let ranAnything = false;
      for (const phase of PHASES) {
        // OBSERVE: reload case state before each phase so tools see prior results.
        const state = await loadAgentState(inv.id, latestQuestions);
        const phaseTools = TOOLS.filter((t) => phase.includes(t.category));
        const cands = pendingCandidates(state, phaseTools, attempted);
        if (cands.length === 0) continue;
        // PLAN: mandatory tools always; optional tools via planner.
        const mandatory = cands.filter((c) => c.tool.mandatory);
        const optional = cands.filter((c) => !c.tool.mandatory);
        const optPlan: Plan = run.plannerMode === "llm" ? await planOptional(ctx, state, optional) : deterministicPlan(optional);
        if (optPlan.note) plannerNotes.push(optPlan.note);
        for (const sk of optPlan.skipped) {
          attempted.add(`${sk.tool.name}|${sk.candidate.inputHash}`);
          await db.insert(toolRun).values({ id: newId("tr"), agentRunId: runId, investigationId: inv.id, iteration: iterations, tool: sk.tool.name, status: "skipped", mode: "LLM", reason: `Planner skipped: ${sk.skipReason}`.slice(0, 400), inputHash: sk.candidate.inputHash, inputSummary: sk.candidate.inputSummary.slice(0, 300), finishedAt: new Date(), durationMs: 0 });
        }
        const steps = [...mandatory.map((c) => ({ ...c, reason: c.candidate.reason })), ...optPlan.steps];
        // EXECUTE
        for (const step of steps) {
          ranAnything = true;
          const r = await execute(step.tool, step.candidate, step.reason, state);
          if (r === "stop") break outer;
        }
        // RECONCILE + EVALUATE + PERSIST after the evaluation phase.
        if (phase.includes("evaluation") && ctx.evaluation.ran.size > 0) {
          const seen = new Set<string>();
          const merged: FindingDraft[] = ctx.evaluation.findings
            .filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)))
            .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
          const res = await persistEvaluation(inv.id, merged, ctx.evaluation.links, ctx.evaluation.contradicted, runId);
          if (res.created.length || res.resolved.length) {
            await logEvent(inv.id, "evaluation_persisted", "agent", `Re-evaluated: ${res.created.length} new, ${res.resolved.length} resolved, ${merged.length} active finding(s).`, { runId });
          }
          ctx.evaluation = { findings: [], links: [], contradicted: new Set(), ran: new Set() };
        }
      }
      if (!ranAnything) break; // EVALUATE: nothing left to do
    }
    if (iterations > run.maxIterations && finalStatus === "completed") {
      const leftover = pendingCandidates(await loadAgentState(inv.id, latestQuestions), TOOLS, attempted);
      if (leftover.length > 0) finalStatus = "stopped_budget";
    }
  } catch (err) {
    finalStatus = "failed";
    errorMsg = err instanceof Error ? err.message.slice(0, 300) : "Unexpected error";
    console.error("[safelease] agent run failed:", errorMsg);
  }

  const toolRows = await db.select({ status: toolRun.status }).from(toolRun).where(eq(toolRun.agentRunId, runId));
  const ok = toolRows.filter((t) => t.status === "succeeded").length;
  const unavailable = toolRows.filter((t) => t.status === "not_configured" || t.status === "provider_unavailable").length;
  const summary = `${ok} tool run(s) succeeded${unavailable ? `, ${unavailable} unavailable (provider not configured or offline)` : ""}${toolRows.some((t) => t.status === "failed") ? `, ${toolRows.filter((t) => t.status === "failed").length} failed` : ""}.`;
  await db
    .update(agentRun)
    .set({
      status: finalStatus,
      iterations: Math.min(iterations, run.maxIterations),
      toolCalls,
      finishedAt: new Date(),
      summary,
      plannerNote: plannerNotes.join(" ").slice(0, 1000) || null,
      openQuestions: (latestQuestions as VerificationQuestion[] | null)?.map((q) => q.question) ?? null,
      error: errorMsg,
    })
    .where(eq(agentRun.id, runId));
  await db.update(investigation).set({ lastRunAt: new Date(), updatedAt: new Date() }).where(eq(investigation.id, inv.id));
  const statusText = { completed: "completed", stopped_budget: "stopped at its tool budget (some checks remain)", cancelled: "was cancelled", failed: "failed" }[finalStatus];
  await logEvent(inv.id, "agent_run_finished", "agent", `Investigation run ${statusText}. ${summary}`, { runId, status: finalStatus });
}

export async function runAgentNow(userId: string, investigationId: string, opts: StartRunOptions) {
  const { runId, reused } = await createAgentRun(userId, investigationId, opts);
  if (!reused) await executeAgentRun(runId);
  return runId;
}

export async function getRunWithTools(userId: string, runId: string) {
  const [r] = await db.select().from(agentRun).where(eq(agentRun.id, runId));
  if (!r) throw notFound("Run");
  await getInvestigationForUser(userId, r.investigationId);
  const tools = await db.select().from(toolRun).where(eq(toolRun.agentRunId, runId)).orderBy(toolRun.startedAt);
  return { run: r, tools };
}

export async function listRuns(userId: string, investigationId: string, limit = 10) {
  await getInvestigationForUser(userId, investigationId);
  return db.select().from(agentRun).where(eq(agentRun.investigationId, investigationId)).orderBy(desc(agentRun.startedAt)).limit(limit);
}

/** Marks runs left in queued/running by a crashed process as failed. */
export async function sweepStaleRuns() {
  await db
    .update(agentRun)
    .set({ status: "failed", error: "Run did not finish (process stopped).", finishedAt: new Date() })
    .where(and(or(eq(agentRun.status, "running"), eq(agentRun.status, "queued")), lt(agentRun.startedAt, new Date(Date.now() - STALE_RUN_MS)), isNull(agentRun.finishedAt)));
}
