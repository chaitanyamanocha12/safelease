import type { ClaimType, EvidenceKind, EvidenceStatus, VerificationCheckType } from "../db/schema/investigations";

export interface ClaimRecord {
  id: string;
  evidenceId: string;
  claimType: ClaimType;
  value: string;
  normalized: string;
  excerpt: string | null;
  locator: string | null;
  extractor: "deterministic" | "llm" | "user";
  status: EvidenceStatus;
  supersededAt: Date | null;
  extractedAt: Date;
}

export interface EvidenceRecord {
  id: string;
  kind: EvidenceKind;
  title: string;
  createdAt: Date;
  occurredAt: Date | null;
  supersedesEvidenceId: string | null;
  sourceUrl: string | null;
}

export interface CheckRecord {
  checkType: VerificationCheckType;
  status: "not_started" | "in_progress" | "supported" | "contradicted" | "unverified" | "provider_unavailable" | "not_applicable";
  summary?: string | null;
  providerMode?: string | null;
}

export interface ImageMatchRecord {
  evidenceId: string;
  matchedLabel: string;
  matchType: "local_exact" | "local_near" | "web_match";
  distance: number;
  matchedListingId?: string | null;
  matchedEvidenceId?: string | null;
  conflictingDetails?: string[];
}

export interface RentContext {
  medianCents: number;
  count: number;
  sourceLabel: string;
  isDemo: boolean;
  bedrooms: number | null;
  city: string | null;
}

export interface CaseSnapshot {
  investigationId: string;
  claims: ClaimRecord[];
  evidence: EvidenceRecord[];
  checks: CheckRecord[];
  imageMatches?: ImageMatchRecord[];
  rentContext?: RentContext | null;
}

export interface FindingDraft {
  key: string;
  category: "contradiction" | "legal" | "warning" | "unknown" | "verification_gap" | "image" | "context";
  label: EvidenceStatus;
  severity: "info" | "caution" | "serious";
  title: string;
  explanation: string;
  recommendation?: string;
  ruleKey?: string;
  ruleVersion?: number;
  citationLabel?: string;
  citationUrl?: string;
  claimIds: string[];
  evidenceIds: string[];
  requiresHumanReview: boolean;
}

export interface LinkDraft {
  fromClaimId: string;
  toClaimId: string;
  relation: "supports" | "contradicts" | "updates";
  explanation: string;
}

export interface VerificationQuestion {
  key: string;
  question: string;
  reason: string;
  findingKeys: string[];
  purpose:
    | "request_viewing"
    | "verify_management"
    | "clarify_deposit"
    | "clarify_fees"
    | "rent_discrepancy"
    | "corrected_lease"
    | "utilities"
    | "payment_recipient"
    | "general";
  priority: number;
}
