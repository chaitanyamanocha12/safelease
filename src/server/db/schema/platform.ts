/**
 * Platform tables: profiles, organizations, consent, notifications,
 * monitoring jobs, provider health, usage and audit.
 */
import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

const now = sql`(unixepoch() * 1000)`;
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const createdAt = () => ts("created_at").notNull().default(now);
const updatedAt = () => ts("updated_at").notNull().default(now);

export const userProfile = sqliteTable("user_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  city: text("city"),
  province: text("province"),
  renterType: text("renter_type", {
    enum: ["student", "international_student", "newcomer", "first_time", "relocating", "general"],
  }),
  budgetMinCents: integer("budget_min_cents"),
  budgetMaxCents: integer("budget_max_cents"),
  bedrooms: integer("bedrooms"),
  desiredLocation: text("desired_location"),
  moveInDate: text("move_in_date"),
  accessibilityNeeds: text("accessibility_needs"),
  onboardingCompletedAt: ts("onboarding_completed_at"),
  /** Optional automatic deletion window for closed cases (days). Null = keep until user deletes. */
  retentionDays: integer("retention_days"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const notificationPreference = sqliteTable("notification_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  inApp: integer("in_app", { mode: "boolean" }).notNull().default(true),
  email: integer("email", { mode: "boolean" }).notNull().default(false),
  deadlineReminders: integer("deadline_reminders", { mode: "boolean" }).notNull().default(true),
  listingUpdates: integer("listing_updates", { mode: "boolean" }).notNull().default(true),
  caseUpdates: integer("case_updates", { mode: "boolean" }).notNull().default(true),
  updatedAt: updatedAt(),
});

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  orgType: text("org_type", {
    enum: ["university", "student_union", "settlement", "housing_nonprofit", "tenant_support", "other"],
  }).notNull(),
  brandColor: text("brand_color").notNull().default("#14B8A6"),
  displayName: text("display_name"),
  contactEmail: text("contact_email"),
  /** Aggregate reports suppress any group smaller than this. */
  minAggregateGroupSize: integer("min_aggregate_group_size").notNull().default(5),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const organizationMembership = sqliteTable(
  "organization_membership",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["org_admin", "adviser", "member"] }).notNull(),
    status: text("status", { enum: ["active", "removed"] }).notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("membership_org_user_uq").on(t.orgId, t.userId), index("membership_user_idx").on(t.userId)],
);

export const organizationInvitation = sqliteTable(
  "organization_invitation",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["org_admin", "adviser", "member"] }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    status: text("status", { enum: ["pending", "accepted", "revoked", "expired"] }).notNull().default("pending"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("invitation_org_idx").on(t.orgId), index("invitation_email_idx").on(t.email)],
);

/**
 * Explicit, revocable renter consent to share one case with one organization.
 * Organization membership alone NEVER grants access to a renter's cases.
 */
export const consentGrant = sqliteTable(
  "consent_grant",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    resourceType: text("resource_type", { enum: ["investigation", "dispute"] }).notNull(),
    resourceId: text("resource_id").notNull(),
    scope: text("scope", { enum: ["redacted", "full"] }).notNull().default("redacted"),
    status: text("status", { enum: ["active", "revoked"] }).notNull().default("active"),
    message: text("message"),
    grantedAt: createdAt(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("consent_user_idx").on(t.userId), index("consent_org_idx").on(t.orgId, t.status)],
);

export const caseReferral = sqliteTable(
  "case_referral",
  {
    id: text("id").primaryKey(),
    consentGrantId: text("consent_grant_id")
      .notNull()
      .unique()
      .references(() => consentGrant.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    reviewStatus: text("review_status", { enum: ["new", "in_review", "awaiting_renter", "closed"] })
      .notNull()
      .default("new"),
    assignedAdviserId: text("assigned_adviser_id").references(() => user.id, { onDelete: "set null" }),
    closedAt: ts("closed_at"),
    closureNote: text("closure_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("referral_org_idx").on(t.orgId)],
);

export const adviserNote = sqliteTable("adviser_note", {
  id: text("id").primaryKey(),
  referralId: text("referral_id")
    .notNull()
    .references(() => caseReferral.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  visibleToRenter: integer("visible_to_renter", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const notification = sqliteTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    category: text("category", {
      enum: ["case", "evidence", "verification", "listing", "deadline", "organization", "system"],
    }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    dedupeKey: text("dedupe_key").unique(),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notification_user_idx").on(t.userId, t.readAt)],
);

export const monitoringJob = sqliteTable(
  "monitoring_job",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    jobType: text("job_type", {
      enum: [
        "investigation_recheck",
        "saved_search_refresh",
        "deposit_deadline_reminder",
        "maintenance_followup",
        "legal_source_review",
        "retention_cleanup",
      ],
    }).notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    intervalHours: integer("interval_hours").notNull().default(24),
    status: text("status", { enum: ["active", "paused"] }).notNull().default("active"),
    nextRunAt: ts("next_run_at").notNull(),
    lastRunAt: ts("last_run_at"),
    lastStatus: text("last_status", { enum: ["succeeded", "failed", "skipped"] }),
    lastMessage: text("last_message"),
    createdAt: createdAt(),
  },
  (t) => [index("job_due_idx").on(t.status, t.nextRunAt), index("job_owner_idx").on(t.ownerId)],
);

export const jobRun = sqliteTable(
  "job_run",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => monitoringJob.id, { onDelete: "cascade" }),
    trigger: text("trigger", { enum: ["manual_runner", "admin", "cron_endpoint", "user"] }).notNull(),
    status: text("status", { enum: ["succeeded", "failed", "skipped"] }).notNull(),
    message: text("message"),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("job_run_job_idx").on(t.jobId)],
);

export const providerHealthCheck = sqliteTable(
  "provider_health_check",
  {
    id: text("id").primaryKey(),
    category: text("category").notNull(),
    providerId: text("provider_id").notNull(),
    status: text("status", { enum: ["LIVE", "NOT_CONFIGURED", "UNAVAILABLE", "DEMO", "ERROR"] }).notNull(),
    message: text("message"),
    latencyMs: integer("latency_ms"),
    checkedAt: createdAt(),
  },
  (t) => [index("provider_check_idx").on(t.providerId, t.checkedAt)],
);

export const llmUsage = sqliteTable(
  "llm_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    investigationId: text("investigation_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    purpose: text("purpose").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
    succeeded: integer("succeeded", { mode: "boolean" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("llm_usage_user_idx").on(t.userId, t.createdAt)],
);

export const featureFlag = sqliteTable("feature_flag", {
  key: text("key").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  description: text("description").notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

export const auditEvent = sqliteTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    orgId: text("org_id"),
    outcome: text("outcome", { enum: ["success", "denied", "error"] }).notNull().default("success"),
    /** Redacted metadata only — never document contents or message bodies. */
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_actor_idx").on(t.actorId, t.createdAt),
    index("audit_resource_idx").on(t.resourceType, t.resourceId),
    index("audit_created_idx").on(t.createdAt),
  ],
);
