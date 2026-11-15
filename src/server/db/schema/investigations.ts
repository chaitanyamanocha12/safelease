/**
 * Rental Investigation Graph.
 *
 * evidence  ──produces──▶ claim ──claim_link(supports|contradicts|updates|corrects)──▶ claim
 *                           │
 *                           └──referenced by──▶ finding (contradiction | legal | warning | unknown | verification_gap | image)
 * verification_check, agent_run ─▶ tool_run, investigation_event (timeline), investigation_action
 *
 * Evidence rows are append-only. A newer version of a document references the
 * evidence it supersedes; prior evidence and its claims are never overwritten.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";
import { documentVersion } from "./documents";

const now = sql`(unixepoch() * 1000)`;
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

export const EVIDENCE_KINDS = [
  "listing_text",
  "listing_url",
  "listing_screenshot",
  "property_photo",
  "pdf_document",
  "landlord_message",
  "landlord_response",
  "lease",
  "supporting_document",
  "manual_entry",
  "viewing_note",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** The evidence-status taxonomy used everywhere a conclusion is shown. */
export const EVIDENCE_STATUS = [
  "supported",
  "contradicted",
  "warning",
  "unverified",
  "not_checked",
  "provider_unavailable",
  "needs_review",
] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUS)[number];

export const investigation = sqliteTable(
  "investigation",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status", { enum: ["draft", "active", "awaiting_info", "closed"] }).notNull().default("draft"),
    city: text("city"),
    province: text("province").notNull().default("NS"),
    jurisdiction: text("jurisdiction").notNull().default("CA-NS"),
    listingId: text("listing_id"),
    summary: text("summary"),
    /** Incremented whenever evidence or claims change; used for idempotent tool runs. */
    stateVersion: integer("state_version").notNull().default(0),
    lastRunAt: ts("last_run_at"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    demoScenario: text("demo_scenario"),
    closedAt: ts("closed_at"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [index("investigation_owner_idx").on(t.ownerId, t.updatedAt)],
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigation.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: EVIDENCE_KINDS }).notNull(),
    title: text("title").notNull(),
    textContent: text("text_content"),
    documentId: text("document_id"),
    documentVersionId: text("document_version_id").references(() => documentVersion.id, { onDelete: "set null" }),
    sourceUrl: text("source_url"),
    provenance: text("provenance", {
      enum: ["user_supplied", "url_fetch", "ocr_local", "ocr_provider", "llm_vision", "pdf_text", "provider"],
    }).notNull(),
    /** When the underlying message/document was sent or dated, if the user knows. */
    occurredAt: ts("occurred_at"),
    supersedesEvidenceId: text("supersedes_evidence_id"),
    processingStatus: text("processing_status", { enum: ["pending", "processed", "failed", "no_text"] })
      .notNull()
      .default("pending"),
    processingNote: text("processing_note"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("evidence_investigation_idx").on(t.investigationId, t.createdAt)],
);

export const CLAIM_TYPES = [
  "rent",
  "deposit",
  "application_fee",
  "holding_fee",
  "pet_deposit",
  "other_upfront_fee",
  "requested_payment",
  "address",
  "city",
  "postal_code",
  "bedrooms",
  "bathrooms",
  "property_type",
  "lease_term",
  "move_in_date",
  "utilities",
  "parking",
  "furnished",
  "pets",
  "contact_name",
  "contact_email",
  "contact_phone",
  "payment_recipient",
  "payment_method",
  "landlord_location",
  "viewing_availability",
  "urgency",
  "sensitive_info_request",
  "link",
  "source_platform",
  "late_fee",
  "entry_notice",
  "listing_title",
  "embedded_instruction",
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const claim = sqliteTable(
  "claim",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigation.id, { onDelete: "cascade" }),
    evidenceId: text("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    claimType: text("claim_type", { enum: CLAIM_TYPES }).notNull(),
    /** Display value as stated in the source. */
    value: text("value").notNull(),
    /** Canonical value for matching (cents, lowercase email, digits-only phone…). */
    normalized: text("normalized").notNull(),
    excerpt: text("excerpt"),
    locator: text("locator"),
    extractor: text("extractor", { enum: ["deterministic", "llm", "user"] }).notNull(),
    extractionConfidence: text("extraction_confidence", { enum: ["high", "medium", "low"] }),
    status: text("status", { enum: EVIDENCE_STATUS }).notNull().default("unverified"),
    /** Set when the user corrects a value; the correction is a new claim. */
    correctsClaimId: text("corrects_claim_id"),
    /** Set when superseded by a correction or a newer document version. Never deleted. */
    supersededAt: ts("superseded_at"),
    extractedAt: ts("extracted_at").notNull().default(now),
    lastCheckedAt: ts("last_checked_at"),
  },
  (t) => [
    index("claim_investigation_idx").on(t.investigationId, t.claimType),
    index("claim_evidence_idx").on(t.evidenceId),
  ],
);

export const claimLink = sqliteTable(
  "claim_link",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigation.id, { onDelete: "cascade" }),
    fromClaimId: text("from_claim_id")
      .notNull()
      .references(() => claim.id, { onDelete: "cascade" }),
    toClaimId: text("to_claim_id")
      .notNull()
      .references(() => claim.id, { onDelete: "cascade" }),
    relation: text("relation", { enum: ["supports", "contradicts", "updates", "corrects"] }).notNull(),
    explanation: text("explanation"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("claim_link_uq").on(t.fromClaimId, t.toClaimId, t.relation),
    index("claim_link_investigation_idx").on(t.investigationId),
  ],
);

export const finding = sqliteTable(
  "finding",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigation.id, { onDelete: "cascade" }),
    /** Stable key (e.g. "contradiction:rent") so re-evaluation updates rather than duplicates. */
    findingKey: text("finding_key").notNull(),
    category: text("category", {
      enum: ["contradiction", "legal", "warning", "unknown", "verification_gap", "image", "context"],
    }).notNull(),
    label: text("label", { enum: EVIDENCE_STATUS }).notNull(),
    severity: text("severity", { enum: ["info", "caution", "serious"] }).notNull(),
    lifecycle: text("lifecycle", { enum: ["active", "resolved", "dismissed"] }).notNull().default("active"),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    recommendation: text("recommendation"),
    ruleKey: text("rule_key"),
    ruleVersion: integer("rule_version"),
    citationLabel: text("citation_label"),
    citationUrl: text("citation_url"),
    claimIds: json<string[]>("claim_ids").notNull().default(sql`'[]'`),
    evidenceIds: json<string[]>("evidence_ids").notNull().default(sql`'[]'`),
    requiresHumanReview: integer("requires_human_review", { mode: "boolean" }).notNull().default(false),
    humanReview: text("human_review", { enum: ["not_required", "pending", "confirmed", "disputed"] })
      .notNull()
      .default("not_required"),
    humanReviewNote: text("human_review_note"),
    detectedByRunId: text("detected_by_run_id"),
    firstDetectedAt: ts("first_detected_at").notNull().default(now),
    lastEvaluatedAt: ts("last_evaluated_at").notNull().default(now),
    resolvedAt: ts("resolved_at"),
    resolutionNote: text("resolution_note"),
  },
  (t) => [
    uniqueIndex("finding_key_uq").on(t.investigationId, t.findingKey),
    index("finding_investigation_idx").on(t.investigationId, t.lifecycle),
  ],
);

export const VERIFICATION_CHECK_TYPES = [
  "address_validity",
  "rental_authority",
  "independent_contact",
  "payment_recipient_consistency",
  "viewing_confirmed",
  "public_business_info",
  "image_reuse_local",
  "image_reuse_web",
  "lease_matches_listing",
] as const;
export type VerificationCheckType = (typeof VERIFICATION_CHECK_TYPES)[number];

export const verificationCheck = sqliteTable(
  "verification_check",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigation.id, { onDelete: "cascade" }),
    checkType: text("check_type", { enum: VERIFICATION_CHECK_TYPES }).notNull(),
    status: text("status", {
      enum: ["not_started", "in_progress", "supported", "contradicted", "unverified", "provider_unavailable", "not_applicable"],
    })
      .notNull()
      .default("not_started"),
    method: text("method"),
    summary: text("summary"),
    performedBy: text("performed_by", { enum: ["user", "agent", "provider"] }),
    providerId: text("provider_id"),
    providerMode: text("provider_mode", { enum: ["LIVE", "DEMO", "DETERMINISTIC", "USER", "NOT_CONFIGURED"] }),
    evidenceIds: json<string[]>("evidence_ids").notNull().default(sql`'[]'`),
    details: json<Record<string, unknown>>("details"),
    checkedAt: ts("checked_at"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("verification_check_uq").on(t.investigationId, t.checkType)],
);

export const verificationHistory = sqliteTable(
  "verification_history",
  {
    id: text("id").primaryKey(),
    checkId: text("check_id")
      .notNull()
      .references(() => verificationCheck.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    note: text("note"),
    actor: text("actor", { enum: ["user", "agent", "provider"] }).notNull(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("verification_history_check_idx").on(t.checkId)],
);

export const agentRun = sqliteTable(
  "agent_run",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigation.id, { onDelete: "cascade" }),
    trigger: text("trigger", { enum: ["manual", "new_evidence", "correction", "scheduled", "demo_seed"] }).notNull(),
    status: text("status", { enum: ["queued", "running", "completed", "stopped_budget", "failed", "cancelled"] })
      .notNull()
      .default("queued"),
    plannerMode: text("planner_mode", { enum: ["llm", "deterministic"] }).notNull(),
    plannerNote: text("planner_note"),
    maxIterations: integer("max_iterations").notNull(),
    maxToolCalls: integer("max_tool_calls").notNull(),
    iterations: integer("iterations").notNull().default(0),
    toolCalls: integer("tool_calls").notNull().default(0),
    stateVersionAtStart: integer("state_version_at_start").notNull().default(0),
    idempotencyKey: text("idempotency_key").unique(),
    cancelRequested: integer("cancel_requested", { mode: "boolean" }).notNull().default(false),
    summary: text("summary"),
    openQuestions: json<string[]>("open_questions"),
    error: text("error"),
    startedAt: ts("started_at").notNull().default(now),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("agent_run_investigation_idx").on(t.investigationId, t.startedAt)],
);

export const TOOL_RUN_STATUS = [
  "running",
  "succeeded",
  "failed",
  "skipped",
  "not_configured",
  "provider_unavailable",
  "budget_exceeded",
  "cancelled",
] as const;

export const toolRun = sqliteTable(
  "tool_run",
  {
    id: text("id").primaryKey(),
    agentRunId: text("agent_run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigation.id, { onDelete: "cascade" }),
    iteration: integer("iteration").notNull(),
    tool: text("tool").notNull(),
    status: text("status", { enum: TOOL_RUN_STATUS }).notNull(),
    /** How the tool produced its output. LIVE only when a real external provider answered. */
    mode: text("mode", { enum: ["DETERMINISTIC", "LLM", "LIVE", "DEMO", "LOCAL", "NONE"] }).notNull(),
    reason: text("reason"),
    inputHash: text("input_hash"),
    inputSummary: text("input_summary"),
    output: json<Record<string, unknown>>("output"),
    error: text("error"),
    startedAt: ts("started_at").notNull().default(now),
    finishedAt: ts("finished_at"),
    durationMs: integer("duration_ms"),
  },
  (t) => [index("tool_run_run_idx").on(t.agentRunId), index("tool_run_investigation_idx").on(t.investigationId)],
);

export const investigationEvent = sqliteTable(
  "investigation_event",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigation.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actor: text("actor", { enum: ["user", "agent", "system"] }).notNull(),
    message: text("message").notNull(),
    data: json<Record<string, unknown>>("data"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("event_investigation_idx").on(t.investigationId, t.createdAt)],
);

export const investigationAction = sqliteTable(
  "investigation_action",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigation.id, { onDelete: "cascade" }),
    actionKey: text("action_key").notNull(),
    actionType: text("action_type", {
      enum: ["send_message", "request_document", "independent_verification", "schedule_viewing", "enable_monitoring", "explore_alternatives", "seek_advice"],
    }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    /**
     * proposed → (user) approved/dismissed → completed_by_user | submitted (provider acknowledged) | failed.
     * "submitted" is only set after a provider acknowledgement.
     */
    status: text("status", { enum: ["proposed", "approved", "dismissed", "completed_by_user", "submitted", "failed"] })
      .notNull()
      .default("proposed"),
    messageDraftId: text("message_draft_id"),
    proposedByRunId: text("proposed_by_run_id"),
    verificationNote: text("verification_note"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
    completedAt: ts("completed_at"),
  },
  (t) => [uniqueIndex("action_key_uq").on(t.investigationId, t.actionKey)],
);

export const communication = sqliteTable(
  "communication",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    investigationId: text("investigation_id"),
    maintenanceCaseId: text("maintenance_case_id"),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    channel: text("channel", { enum: ["email", "sms", "platform_message", "phone_note", "in_person", "other"] }).notNull(),
    counterpartName: text("counterpart_name"),
    counterpartContact: text("counterpart_contact"),
    body: text("body").notNull(),
    occurredAt: ts("occurred_at"),
    evidenceId: text("evidence_id"),
    messageDraftId: text("message_draft_id"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("communication_investigation_idx").on(t.investigationId), index("communication_owner_idx").on(t.ownerId)],
);

export const messageDraft = sqliteTable(
  "message_draft",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    investigationId: text("investigation_id"),
    maintenanceCaseId: text("maintenance_case_id"),
    purpose: text("purpose").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    recipient: text("recipient"),
    generatedBy: text("generated_by", { enum: ["template", "llm", "user"] }).notNull(),
    status: text("status", { enum: ["draft", "approved", "copied", "submitted", "failed", "marked_sent_by_user"] })
      .notNull()
      .default("draft"),
    providerId: text("provider_id"),
    providerMessageId: text("provider_message_id"),
    providerError: text("provider_error"),
    approvedAt: ts("approved_at"),
    submittedAt: ts("submitted_at"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [index("draft_owner_idx").on(t.ownerId), index("draft_investigation_idx").on(t.investigationId)],
);

export const prepaymentReview = sqliteTable(
  "prepayment_review",
  {
    id: text("id").primaryKey(),
    investigationId: text("investigation_id")
      .notNull()
      .references(() => investigation.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    requestedAmountCents: integer("requested_amount_cents"),
    purpose: text("purpose", { enum: ["security_deposit", "first_month_rent", "application_fee", "holding_fee", "other"] }),
    paymentMethod: text("payment_method"),
    recipientName: text("recipient_name"),
    dueBy: text("due_by"),
    leaseSigned: integer("lease_signed", { mode: "boolean" }),
    viewedInPerson: integer("viewed_in_person", { mode: "boolean" }),
    checklist: json<Record<string, boolean>>("checklist").notNull().default(sql`'{}'`),
    result: json<Record<string, unknown>>("result"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("prepayment_investigation_uq").on(t.investigationId)],
);
