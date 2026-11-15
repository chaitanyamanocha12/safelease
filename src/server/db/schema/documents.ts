/**
 * Private document vault. Files are stored in private storage (never
 * /public) and served only through authorized route handlers.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

const now = sql`(unixepoch() * 1000)`;
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

export const DOCUMENT_TYPES = [
  "listing",
  "conversation",
  "lease",
  "lease_revision",
  "deposit_receipt",
  "photo",
  "inspection_report",
  "repair",
  "official_notice",
  "correspondence",
  "verification",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const document = sqliteTable(
  "document",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    docType: text("doc_type", { enum: DOCUMENT_TYPES }).notNull(),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    notes: text("notes"),
    investigationId: text("investigation_id"),
    tenancyId: text("tenancy_id"),
    maintenanceCaseId: text("maintenance_case_id"),
    disputeId: text("dispute_id"),
    depositId: text("deposit_id"),
    currentVersion: integer("current_version").notNull().default(1),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    /** Soft delete; permanent deletion removes rows and stored bytes. */
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [
    index("document_owner_idx").on(t.ownerId, t.deletedAt),
    index("document_investigation_idx").on(t.investigationId),
  ],
);

export const documentVersion = sqliteTable(
  "document_version",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    storageProvider: text("storage_provider", { enum: ["local", "s3"] }).notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    pageCount: integer("page_count"),
    extractedText: text("extracted_text"),
    /** Per-page text for page references (PDF). */
    pageTexts: text("page_texts", { mode: "json" }).$type<string[]>(),
    extractionMethod: text("extraction_method", {
      enum: ["none", "pdf_text", "ocr_local", "ocr_provider", "llm_vision", "plain_text"],
    })
      .notNull()
      .default("none"),
    extractionStatus: text("extraction_status", {
      enum: ["not_attempted", "succeeded", "partial", "failed", "unavailable"],
    })
      .notNull()
      .default("not_attempted"),
    extractionNote: text("extraction_note"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("document_version_uq").on(t.documentId, t.version), index("document_version_sha_idx").on(t.sha256)],
);

/** Perceptual fingerprints for local image-reuse detection. */
export const imageFingerprint = sqliteTable(
  "image_fingerprint",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    /** Exactly one of these is set. */
    documentVersionId: text("document_version_id").references(() => documentVersion.id, { onDelete: "cascade" }),
    listingImageId: text("listing_image_id"),
    pHash: text("p_hash").notNull(),
    aHash: text("a_hash").notNull(),
    width: integer("width"),
    height: integer("height"),
    /** Only metadata actually present in the file (camera model, capture date, GPS present flag). */
    metadata: text("metadata", { mode: "json" }).$type<Record<string, string | number | boolean>>(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("fingerprint_owner_idx").on(t.ownerId), index("fingerprint_listing_img_idx").on(t.listingImageId)],
);
