/**
 * Leases, tenancies, inspections, maintenance, deposits and disputes.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

const now = sql`(unixepoch() * 1000)`;
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

export const lease = sqliteTable(
  "lease",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    investigationId: text("investigation_id"),
    title: text("title").notNull(),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [index("lease_owner_idx").on(t.ownerId)],
);

export const leaseVersion = sqliteTable(
  "lease_version",
  {
    id: text("id").primaryKey(),
    leaseId: text("lease_id")
      .notNull()
      .references(() => lease.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    documentId: text("document_id"),
    documentVersionId: text("document_version_id"),
    evidenceId: text("evidence_id"),
    textContent: text("text_content").notNull(),
    pageTexts: json<string[]>("page_texts"),
    extractionStatus: text("extraction_status", { enum: ["succeeded", "partial", "failed"] }).notNull(),
    terms: json<Record<string, unknown>>("terms"),
    analysis: json<Record<string, unknown>>("analysis"),
    analyzedAt: ts("analyzed_at"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("lease_version_uq").on(t.leaseId, t.version)],
);

export const leaseClause = sqliteTable(
  "lease_clause",
  {
    id: text("id").primaryKey(),
    leaseVersionId: text("lease_version_id")
      .notNull()
      .references(() => leaseVersion.id, { onDelete: "cascade" }),
    clauseType: text("clause_type").notNull(),
    heading: text("heading"),
    text: text("text").notNull(),
    page: integer("page"),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    classification: text("classification", {
      enum: ["standard", "clear_rule_violation", "potential_issue", "unusual_term", "incomplete_extraction", "unverified_interpretation"],
    }).notNull(),
    explanation: text("explanation"),
    ruleKey: text("rule_key"),
    citationUrl: text("citation_url"),
  },
  (t) => [index("lease_clause_version_idx").on(t.leaseVersionId)],
);

export const tenancy = sqliteTable(
  "tenancy",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    investigationId: text("investigation_id"),
    label: text("label").notNull(),
    address: text("address"),
    landlordName: text("landlord_name"),
    landlordContact: text("landlord_contact"),
    leaseType: text("lease_type", { enum: ["year_to_year", "month_to_month", "week_to_week", "fixed_term", "unknown"] })
      .notNull()
      .default("unknown"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    moveInDate: text("move_in_date"),
    monthlyRentCents: integer("monthly_rent_cents"),
    status: text("status", { enum: ["upcoming", "active", "ended"] }).notNull().default("upcoming"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [index("tenancy_owner_idx").on(t.ownerId)],
);

export const ROOMS = ["kitchen", "bathroom", "bedroom", "living_room", "hallway", "exterior", "other"] as const;
export type Room = (typeof ROOMS)[number];

export const inspection = sqliteTable(
  "inspection",
  {
    id: text("id").primaryKey(),
    tenancyId: text("tenancy_id")
      .notNull()
      .references(() => tenancy.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["move_in", "move_out"] }).notNull(),
    inspectedOn: text("inspected_on"),
    landlordPresent: integer("landlord_present", { mode: "boolean" }),
    witnessName: text("witness_name"),
    status: text("status", { enum: ["draft", "completed"] }).notNull().default("draft"),
    notes: text("notes"),
    officialFormCompleted: integer("official_form_completed", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [index("inspection_tenancy_idx").on(t.tenancyId)],
);

export const inspectionItem = sqliteTable(
  "inspection_item",
  {
    id: text("id").primaryKey(),
    inspectionId: text("inspection_id")
      .notNull()
      .references(() => inspection.id, { onDelete: "cascade" }),
    room: text("room", { enum: ROOMS }).notNull(),
    roomLabel: text("room_label"),
    itemName: text("item_name").notNull(),
    condition: text("condition", { enum: ["good", "fair", "poor", "damaged", "missing", "not_working", "not_applicable"] }).notNull(),
    description: text("description"),
    preExisting: integer("pre_existing", { mode: "boolean" }).notNull().default(false),
    repairPromised: integer("repair_promised", { mode: "boolean" }).notNull().default(false),
    repairDueDate: text("repair_due_date"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [index("inspection_item_inspection_idx").on(t.inspectionId)],
);

export const inspectionImage = sqliteTable(
  "inspection_image",
  {
    id: text("id").primaryKey(),
    inspectionItemId: text("inspection_item_id")
      .notNull()
      .references(() => inspectionItem.id, { onDelete: "cascade" }),
    documentId: text("document_id").notNull(),
    caption: text("caption"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("inspection_image_item_idx").on(t.inspectionItemId)],
);

export const maintenanceCase = sqliteTable(
  "maintenance_case",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenancyId: text("tenancy_id"),
    inspectionItemId: text("inspection_item_id"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    location: text("location"),
    severity: text("severity", { enum: ["low", "medium", "urgent"] }).notNull().default("medium"),
    status: text("status", {
      enum: ["open", "reported", "repair_promised", "landlord_reports_complete", "tenant_confirmed_resolved", "closed_unresolved"],
    })
      .notNull()
      .default("open"),
    discoveredOn: text("discovered_on"),
    reportedOn: text("reported_on"),
    promisedBy: text("promised_by"),
    confirmedResolvedOn: text("confirmed_resolved_on"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [index("maintenance_owner_idx").on(t.ownerId)],
);

export const maintenanceEvent = sqliteTable(
  "maintenance_event",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => maintenanceCase.id, { onDelete: "cascade" }),
    eventType: text("event_type", {
      enum: [
        "discovered",
        "reported",
        "landlord_response",
        "repair_promised",
        "landlord_reports_complete",
        "tenant_confirmed_resolved",
        "tenant_reports_unresolved",
        "follow_up_sent",
        "photo_added",
        "note",
      ],
    }).notNull(),
    occurredOn: text("occurred_on").notNull(),
    description: text("description").notNull(),
    promisedDate: text("promised_date"),
    documentId: text("document_id"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("maintenance_event_case_idx").on(t.caseId)],
);

export const depositRecord = sqliteTable(
  "deposit_record",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenancyId: text("tenancy_id"),
    amountCents: integer("amount_cents").notNull(),
    monthlyRentCents: integer("monthly_rent_cents"),
    paidOn: text("paid_on"),
    paidTo: text("paid_to"),
    paymentMethod: text("payment_method"),
    moveInInspectionId: text("move_in_inspection_id"),
    moveOutInspectionId: text("move_out_inspection_id"),
    tenancyEndedOn: text("tenancy_ended_on"),
    amountRequestedBackCents: integer("amount_requested_back_cents"),
    amountReturnedCents: integer("amount_returned_cents"),
    status: text("status", {
      enum: ["held", "tenancy_ended", "partially_returned", "fully_returned", "landlord_claim_filed", "disputed", "resolved"],
    })
      .notNull()
      .default("held"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [index("deposit_owner_idx").on(t.ownerId)],
);

export const depositEvent = sqliteTable(
  "deposit_event",
  {
    id: text("id").primaryKey(),
    depositId: text("deposit_id")
      .notNull()
      .references(() => depositRecord.id, { onDelete: "cascade" }),
    eventType: text("event_type", {
      enum: [
        "paid",
        "receipt_uploaded",
        "tenancy_ended",
        "return_requested",
        "amount_returned",
        "deduction_claimed",
        "deduction_disputed",
        "landlord_claim_received",
        "tenant_application_filed",
        "note",
      ],
    }).notNull(),
    occurredOn: text("occurred_on").notNull(),
    amountCents: integer("amount_cents"),
    description: text("description").notNull(),
    documentId: text("document_id"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("deposit_event_deposit_idx").on(t.depositId)],
);

export const disputeCase = sqliteTable(
  "dispute_case",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    disputeType: text("dispute_type", {
      enum: ["deposit", "maintenance", "unexpected_fee", "lease_discrepancy", "rent_increase", "misrepresentation"],
    }).notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    status: text("status", { enum: ["drafting", "ready_for_review", "archived"] }).notNull().default("drafting"),
    investigationId: text("investigation_id"),
    tenancyId: text("tenancy_id"),
    maintenanceCaseId: text("maintenance_case_id"),
    depositId: text("deposit_id"),
    /** Generated package, then edited/approved by the renter. */
    package: json<Record<string, unknown>>("package"),
    outstandingFacts: json<string[]>("outstanding_facts"),
    excludedItemIds: json<string[]>("excluded_item_ids").notNull().default(sql`'[]'`),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [index("dispute_owner_idx").on(t.ownerId)],
);
