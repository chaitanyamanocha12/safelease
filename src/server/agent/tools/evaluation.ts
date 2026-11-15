/**
 * Mandatory deterministic evaluation tools. Each computes one component;
 * the orchestrator merges and persists them after the iteration.
 */
import { formatCents } from "@/lib/money";
import { reconcile } from "../../investigation/reconcile";
import { applyLegalRules } from "../../investigation/legal-apply";
import { assessIndicators } from "../../investigation/indicators";
import { assessGaps } from "../../investigation/gaps";
import { activeClaims, byType, centsOf } from "../../investigation/active";
import { maxDepositCents } from "../../legal/rules";
import { hashOf, type AgentTool, type AgentState } from "./types";

function evalCandidate(name: string, reason: string) {
  return (s: AgentState) =>
    s.snapshot.evidence.length === 0
      ? []
      : [{ inputHash: hashOf([name, s.inv.stateVersion]), reason, inputSummary: `case state v${s.inv.stateVersion}`, input: {} }];
}

export const reconcileEvidence: AgentTool<object> = {
  name: "reconcile_evidence",
  label: "Evidence reconciliation",
  description: "Compares statements across sources to find agreements, changes and contradictions. Preserves superseded evidence.",
  category: "evaluation",
  mandatory: true,
  permission: "read_case",
  candidates: evalCandidate("reconcile_evidence", "Evidence or claims changed since the last reconciliation."),
  async run(ctx, s) {
    const r = reconcile(s.snapshot);
    ctx.evaluation.findings.push(...r.findings);
    ctx.evaluation.links.push(...r.links);
    r.contradictedClaimIds.forEach((id) => ctx.evaluation.contradicted.add(id));
    ctx.evaluation.ran.add("reconcile_evidence");
    const contradictions = r.findings.filter((f) => f.category === "contradiction").length;
    return {
      status: "succeeded",
      mode: "DETERMINISTIC",
      summary: `${r.links.length} cross-source comparison(s); ${contradictions} contradiction(s); ${r.findings.length - contradictions} identity/recipient concern(s).`,
      output: { comparisons: r.links.length, findingKeys: r.findings.map((f) => f.key) },
    };
  },
};

export const legalRuleCheck: AgentTool<object> = {
  name: "legal_rule_check",
  label: "Nova Scotia rule check",
  description: "Applies versioned, source-cited Nova Scotia tenancy rules with deterministic logic (no LLM).",
  category: "evaluation",
  mandatory: true,
  permission: "read_case",
  candidates: evalCandidate("legal_rule_check", "Terms changed; applicable tenancy rules must be re-checked."),
  async run(ctx, s) {
    const r = applyLegalRules(s.snapshot, ctx.rules);
    ctx.evaluation.findings.push(...r.findings);
    ctx.evaluation.ran.add("legal_rule_check");
    return {
      status: "succeeded",
      mode: "DETERMINISTIC",
      summary: `${r.results.length} rule check(s) evaluated; ${r.findings.length} concern(s).`,
      output: { results: r.results.map((x) => ({ rule: x.ruleKey, version: x.ruleVersion, outcome: x.outcome })) },
    };
  },
};

export const depositCalculation: AgentTool<object> = {
  name: "deposit_calculation",
  label: "Deposit calculation",
  description: "Calculates the maximum permitted deposit from stated rent using integer-cent arithmetic.",
  category: "evaluation",
  mandatory: true,
  permission: "read_case",
  candidates(s) {
    const c = activeClaims(s.snapshot);
    if (byType(c, "rent").length === 0) return [];
    return [{ inputHash: hashOf(["deposit_calculation", s.inv.stateVersion]), reason: "Rent is stated; compute the deposit limit.", inputSummary: "rent + deposit claims", input: {} }];
  },
  async run(ctx, s) {
    const c = activeClaims(s.snapshot);
    const rents = [...new Set(byType(c, "rent").map(centsOf).filter((x): x is number => x !== null))];
    const deposits = [...new Set(byType(c, "deposit").map(centsOf).filter((x): x is number => x !== null))];
    const upfront = [...byType(c, "holding_fee"), ...byType(c, "pet_deposit")].map(centsOf).filter((x): x is number => x !== null);
    const rows = rents.map((r) => ({ rent: formatCents(r), maxDeposit: formatCents(maxDepositCents(r)) }));
    const worst = deposits.length ? Math.max(...deposits) + upfront.reduce((a, b) => a + b, 0) : null;
    const strictest = rents.length ? maxDepositCents(Math.min(...rents)) : null;
    ctx.evaluation.ran.add("deposit_calculation");
    return {
      status: "succeeded",
      mode: "DETERMINISTIC",
      summary: rows.map((r) => `Rent ${r.rent} → deposit max ${r.maxDeposit}`).join("; ") + (worst !== null ? `. Largest deposit-like request: ${formatCents(worst)}.` : "."),
      output: { byRent: rows, largestRequest: worst !== null ? formatCents(worst) : null, excessOverStrictest: worst !== null && strictest !== null && worst > strictest ? formatCents(worst - strictest) : null },
    };
  },
};

export const riskIndicatorAssessment: AgentTool<object> = {
  name: "risk_indicator_assessment",
  label: "Risk indicator assessment",
  description: "Identifies potential warning signs with the evidence that triggered them. Never produces a fraud probability.",
  category: "evaluation",
  mandatory: true,
  permission: "read_case",
  candidates: evalCandidate("risk_indicator_assessment", "Re-assess warning signs against the current evidence."),
  async run(ctx, s) {
    const f = assessIndicators(s.snapshot);
    ctx.evaluation.findings.push(...f);
    ctx.evaluation.ran.add("risk_indicator_assessment");
    return { status: "succeeded", mode: "DETERMINISTIC", summary: `${f.filter((x) => x.category !== "context").length} potential warning sign(s), ${f.filter((x) => x.category === "context").length} context note(s).`, output: { findingKeys: f.map((x) => x.key) } };
  },
};

export const verificationGapAnalysis: AgentTool<object> = {
  name: "verification_gap_analysis",
  label: "Verification gap analysis",
  description: "Lists what has not been verified (authority, viewing, address) and which core facts are missing.",
  category: "evaluation",
  mandatory: true,
  permission: "read_case",
  candidates: evalCandidate("verification_gap_analysis", "Keep unknowns explicit after any change."),
  async run(ctx, s) {
    const f = assessGaps(s.snapshot);
    ctx.evaluation.findings.push(...f);
    ctx.evaluation.ran.add("verification_gap_analysis");
    return { status: "succeeded", mode: "DETERMINISTIC", summary: `${f.length} open verification gap(s) or unknown(s).`, output: { findingKeys: f.map((x) => x.key) } };
  },
};
