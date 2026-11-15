import { analyzeConversation, analyzeDocument, analyzeListing, fetchListingPage } from "./tools/extraction";
import { depositCalculation, legalRuleCheck, reconcileEvidence, riskIndicatorAssessment, verificationGapAnalysis } from "./tools/evaluation";
import { imageReuseCheck, landlordBusinessResearch, listingDiscovery, rentalComparison, verifyAddress, webImageSearch } from "./tools/verification";
import { caseMonitoring, generateVerificationQuestions, prepareCommunication, summarizeCase, verifyActions } from "./tools/actions";
import type { AgentTool, ToolCategory } from "./tools/types";

/** Ordered tool registry. Order = deterministic planner priority within a phase. */
export const TOOLS: AgentTool<any>[] = [
  fetchListingPage,
  analyzeListing,
  analyzeConversation,
  analyzeDocument,
  reconcileEvidence,
  legalRuleCheck,
  depositCalculation,
  riskIndicatorAssessment,
  verificationGapAnalysis,
  verifyAddress,
  imageReuseCheck,
  webImageSearch,
  landlordBusinessResearch,
  rentalComparison,
  listingDiscovery,
  generateVerificationQuestions,
  prepareCommunication,
  caseMonitoring,
  verifyActions,
  summarizeCase,
];

export const PHASES: ToolCategory[][] = [["ingestion"], ["extraction"], ["evaluation"], ["verification", "research"], ["action", "reporting"]];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function toolCatalog() {
  return TOOLS.map((t) => ({ name: t.name, label: t.label, description: t.description, category: t.category, mandatory: t.mandatory, permission: t.permission }));
}
