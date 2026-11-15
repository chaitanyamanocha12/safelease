/**
 * Versioned legal-rule database. Deterministic logic lives in code
 * (src/server/legal/rules), keyed by `logicKey`. The database records
 * metadata, parameters, sources, verification dates and review status.
 * A new version only becomes effective after an administrator reviews it.
 */
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

const now = sql`(unixepoch() * 1000)`;
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

export const legalSource = sqliteTable("legal_source", {
  id: text("id").primaryKey(),
  sourceKey: text("source_key").notNull().unique(),
  title: text("title").notNull(),
  publisher: text("publisher").notNull(),
  url: text("url").notNull(),
  sourceType: text("source_type", {
    enum: ["statute", "regulation", "government_guide", "government_form", "government_page"],
  }).notNull(),
  /** Date SafeLease staff last confirmed the cited language at this URL (YYYY-MM-DD). */
  verifiedOn: text("verified_on"),
  verificationNote: text("verification_note"),
  status: text("status", { enum: ["verified", "needs_review", "unreachable"] }).notNull(),
  lastCheckedAt: ts("last_checked_at"),
  lastCheckHttpStatus: integer("last_check_http_status"),
  createdAt: ts("created_at").notNull().default(now),
});

export const legalRule = sqliteTable("legal_rule", {
  id: text("id").primaryKey(),
  ruleKey: text("rule_key").notNull().unique(),
  jurisdiction: text("jurisdiction").notNull(),
  category: text("category", {
    enum: ["deposit", "fees", "rent_increase", "lease", "inspection", "deposit_return", "privacy", "entry", "payment"],
  }).notNull(),
  logicKey: text("logic_key").notNull(),
  /** The version the engine currently applies (latest verified). */
  effectiveVersion: integer("effective_version").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: ts("created_at").notNull().default(now),
});

export const legalRuleVersion = sqliteTable(
  "legal_rule_version",
  {
    id: text("id").primaryKey(),
    ruleId: text("rule_id")
      .notNull()
      .references(() => legalRule.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    conditions: text("conditions").notNull(),
    citation: text("citation").notNull(),
    sourceKey: text("source_key").notNull(),
    sourceExcerpt: text("source_excerpt"),
    effectiveFrom: text("effective_from"),
    effectiveTo: text("effective_to"),
    params: text("params", { mode: "json" }).$type<Record<string, number | string | boolean>>(),
    reviewStatus: text("review_status", { enum: ["verified", "pending_review", "rejected", "superseded"] }).notNull(),
    verifiedOn: text("verified_on"),
    changeNote: text("change_note"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
    reviewedAt: ts("reviewed_at"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("rule_version_uq").on(t.ruleId, t.version), index("rule_version_status_idx").on(t.reviewStatus)],
);
