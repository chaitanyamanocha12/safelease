/**
 * Full deterministic case evaluation = reconciliation + indicators +
 * legal rules + verification gaps + questions. Pure and testable.
 */
import { applyLegalRules, type RuleLookup } from "./legal-apply";
import { assessGaps } from "./gaps";
import { assessIndicators } from "./indicators";
import { generateQuestions } from "./questions";
import { reconcile } from "./reconcile";
import type { CaseSnapshot, FindingDraft, LinkDraft, VerificationQuestion } from "./types";

export interface Evaluation {
  findings: FindingDraft[];
  links: LinkDraft[];
  contradictedClaimIds: Set<string>;
  questions: VerificationQuestion[];
  rentBasisNote: string | null;
}

const SEVERITY_ORDER = { serious: 0, caution: 1, info: 2 } as const;
const CATEGORY_ORDER = { contradiction: 0, legal: 1, warning: 2, image: 3, verification_gap: 4, unknown: 5, context: 6 } as const;

export function evaluateCase(s: CaseSnapshot, rule: RuleLookup): Evaluation {
  const rec = reconcile(s);
  const legal = applyLegalRules(s, rule);
  const indicators = assessIndicators(s);
  const gaps = assessGaps(s);
  const all = [...rec.findings, ...legal.findings, ...indicators, ...gaps];
  // De-duplicate by key (first wins) and sort for display.
  const seen = new Set<string>();
  const findings = all
    .filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]);
  return {
    findings,
    links: rec.links,
    contradictedClaimIds: rec.contradictedClaimIds,
    questions: generateQuestions(s, findings),
    rentBasisNote: legal.rentBasis?.note ?? null,
  };
}

/** Plain-language headline that never asserts safety or fraud. */
export function headline(findings: FindingDraft[]): { tone: "serious" | "caution" | "neutral"; text: string } {
  const serious = findings.filter((f) => f.severity === "serious" && f.category !== "context").length;
  const caution = findings.filter((f) => f.severity === "caution" && f.category !== "verification_gap").length;
  if (serious > 0)
    return { tone: "serious", text: `${serious} serious concern${serious === 1 ? "" : "s"} found. Do not pay until they are resolved and verified.` };
  if (caution > 0) return { tone: "caution", text: `${caution} item${caution === 1 ? "" : "s"} need clarification before you commit.` };
  return {
    tone: "neutral",
    text: "No warning signs identified in the evidence so far. That does not mean the listing is legitimate — key facts remain unverified.",
  };
}
