import crypto from "node:crypto";
import type { evidence, finding, imageFingerprint, investigationAction, verificationCheck } from "../../db/schema";
import type { InvestigationRow } from "../../services/investigations";
import type { CaseSnapshot, FindingDraft, LinkDraft, VerificationQuestion } from "../../investigation/types";
import type { RuleLookup } from "../../legal/engine";

export type ToolCategory = "ingestion" | "extraction" | "evaluation" | "verification" | "research" | "action" | "reporting";
export type ToolMode = "DETERMINISTIC" | "LLM" | "LIVE" | "DEMO" | "LOCAL" | "NONE";
export type ToolStatus = "succeeded" | "failed" | "skipped" | "not_configured" | "provider_unavailable";

export interface AgentState {
  inv: InvestigationRow;
  snapshot: CaseSnapshot;
  evidenceRows: Array<typeof evidence.$inferSelect>;
  checks: Map<string, typeof verificationCheck.$inferSelect>;
  activeFindings: Array<typeof finding.$inferSelect>;
  fingerprints: Array<typeof imageFingerprint.$inferSelect & { evidenceId: string }>;
  /** `${tool}|${inputHash}` of tool runs already completed for this case. */
  completed: Set<string>;
  actions: Array<typeof investigationAction.$inferSelect>;
  latestQuestions: VerificationQuestion[] | null;
}

export interface ToolContext {
  runId: string;
  userId: string;
  userName: string;
  iteration: number;
  rules: RuleLookup;
  llmCounter: { used: number; max: number };
  signal: AbortSignal;
  /** Evaluation partials computed this iteration (persisted by the orchestrator). */
  evaluation: { findings: FindingDraft[]; links: LinkDraft[]; contradicted: Set<string>; ran: Set<string> };
}

export interface ToolCandidate<I = unknown> {
  inputHash: string;
  reason: string;
  inputSummary: string;
  input: I;
}

export interface ToolOutcome {
  status: ToolStatus;
  mode: ToolMode;
  summary: string;
  output?: Record<string, unknown>;
  /** True when the tool changed evidence/claims/checks (triggers re-evaluation). */
  stateChanged?: boolean;
}

export interface AgentTool<I = unknown> {
  name: string;
  label: string;
  description: string;
  category: ToolCategory;
  /** Mandatory deterministic safety checks run whenever relevant; the planner cannot skip them. */
  mandatory: boolean;
  /** What the tool is allowed to touch. No tool has filesystem, shell or arbitrary network access. */
  permission: "read_case" | "write_case" | "external_read" | "propose_action";
  candidates(state: AgentState): ToolCandidate<I>[];
  run(ctx: ToolContext, state: AgentState, input: I): Promise<ToolOutcome>;
}

export function hashOf(value: unknown): string {
  return crypto.createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}
