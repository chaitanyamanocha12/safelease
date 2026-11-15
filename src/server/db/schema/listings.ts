/**
 * Rental discovery: normalized listings from source adapters, snapshots
 * for change detection, saved properties/searches, comparisons.
 * `isDemo` listings are fictional and must always render with a DEMO label.
 */
import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

const now = sql`(unixepoch() * 1000)`;
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

export const listingSource = sqliteTable("listing_source", {
  id: text("id").primaryKey(),
  sourceKey: text("source_key").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["demo_inventory", "licensed_feed", "external_link", "user_import"] }).notNull(),
  attribution: text("attribution").notNull(),
  termsUrl: text("terms_url"),
  createdAt: ts("created_at").notNull().default(now),
});

export const rentalListing = sqliteTable(
  "rental_listing",
  {
    id: text("id").primaryKey(),
    sourceKey: text("source_key").notNull(),
    externalId: text("external_id"),
    /** Owner for user-imported listings; null for shared inventory. */
    ownerId: text("owner_id").references(() => user.id, { onDelete: "cascade" }),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    title: text("title").notNull(),
    description: text("description"),
    address: text("address"),
    neighbourhood: text("neighbourhood"),
    city: text("city").notNull(),
    province: text("province").notNull().default("NS"),
    postalCode: text("postal_code"),
    lat: real("lat"),
    lng: real("lng"),
    coordinatesSource: text("coordinates_source", { enum: ["fictional_demo", "geocoded", "provider", "user", "none"] })
      .notNull()
      .default("none"),
    rentCents: integer("rent_cents"),
    depositCents: integer("deposit_cents"),
    upfrontFeesCents: integer("upfront_fees_cents"),
    bedrooms: integer("bedrooms"),
    bathrooms: real("bathrooms"),
    propertyType: text("property_type", { enum: ["apartment", "house", "townhouse", "basement_suite", "room", "condo", "duplex", "other"] }),
    furnished: integer("furnished", { mode: "boolean" }),
    parking: text("parking"),
    petsAllowed: integer("pets_allowed", { mode: "boolean" }),
    utilitiesIncluded: json<string[]>("utilities_included").notNull().default(sql`'[]'`),
    accessibilityFeatures: json<string[]>("accessibility_features").notNull().default(sql`'[]'`),
    features: json<string[]>("features").notNull().default(sql`'[]'`),
    leaseType: text("lease_type", { enum: ["year_to_year", "month_to_month", "fixed_term", "unknown"] }),
    availableFrom: text("available_from"),
    publishedAt: ts("published_at"),
    retrievedAt: ts("retrieved_at").notNull().default(now),
    sourceUrl: text("source_url"),
    availabilityStatus: text("availability_status", { enum: ["unverified", "reported_available", "reported_unavailable"] })
      .notNull()
      .default("unverified"),
    dataConfidence: text("data_confidence", { enum: ["demo", "low", "medium", "high"] }).notNull(),
    contactName: text("contact_name"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("listing_source_external_uq").on(t.sourceKey, t.externalId),
    index("listing_city_idx").on(t.city, t.rentCents),
    index("listing_owner_idx").on(t.ownerId),
  ],
);

export const listingImage = sqliteTable(
  "listing_image",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id")
      .notNull()
      .references(() => rentalListing.id, { onDelete: "cascade" }),
    /** Public URL for demo/generated imagery only. Private uploads use documentVersionId. */
    url: text("url"),
    documentVersionId: text("document_version_id"),
    caption: text("caption"),
    provenance: text("provenance", { enum: ["generated_demo", "provider", "user_upload"] }).notNull(),
    position: integer("position").notNull().default(0),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("listing_image_listing_idx").on(t.listingId)],
);

export const listingSnapshot = sqliteTable(
  "listing_snapshot",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id")
      .notNull()
      .references(() => rentalListing.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    snapshot: json<Record<string, unknown>>("snapshot").notNull(),
    capturedAt: ts("captured_at").notNull().default(now),
  },
  (t) => [index("snapshot_listing_idx").on(t.listingId, t.capturedAt)],
);

export const savedProperty = sqliteTable(
  "saved_property",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    listingId: text("listing_id")
      .notNull()
      .references(() => rentalListing.id, { onDelete: "cascade" }),
    notes: text("notes"),
    watch: integer("watch", { mode: "boolean" }).notNull().default(false),
    inComparison: integer("in_comparison", { mode: "boolean" }).notNull().default(false),
    investigationId: text("investigation_id"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("saved_property_uq").on(t.userId, t.listingId)],
);

export const savedSearch = sqliteTable(
  "saved_search",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filters: json<Record<string, unknown>>("filters").notNull(),
    alertsEnabled: integer("alerts_enabled", { mode: "boolean" }).notNull().default(false),
    lastRunAt: ts("last_run_at"),
    lastResultCount: integer("last_result_count"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("saved_search_user_idx").on(t.userId)],
);

export const searchRun = sqliteTable(
  "search_run",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    savedSearchId: text("saved_search_id"),
    originInvestigationId: text("origin_investigation_id"),
    filters: json<Record<string, unknown>>("filters").notNull(),
    providerResults: json<Array<{ sourceKey: string; status: string; count: number; message?: string }>>("provider_results").notNull(),
    resultCount: integer("result_count").notNull(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("search_run_user_idx").on(t.userId, t.createdAt)],
);

export const propertyComparison = sqliteTable(
  "property_comparison",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    listingIds: json<string[]>("listing_ids").notNull(),
    originInvestigationId: text("origin_investigation_id"),
    weights: json<Record<string, number>>("weights").notNull(),
    anchor: json<{ lat: number; lng: number; label: string }>("anchor"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
  },
  (t) => [index("comparison_user_idx").on(t.userId)],
);
