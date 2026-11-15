/** Reference data needed in every environment (not demo): legal sources/rules, listing sources, flags. */
import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { featureFlag, legalRule, legalRuleVersion, legalSource, listingSource, monitoringJob } from "../db/schema";
import { newId } from "@/lib/ids";
import { LEGAL_RULES, LEGAL_SOURCES, SOURCE_VERIFIED_ON } from "../legal/catalog";

export const FEATURE_FLAGS = [
  { key: "url_ingestion", enabled: true, description: "Allow renters to submit public listing URLs for fetching (SSRF-guarded)." },
  { key: "llm_planning", enabled: true, description: "Use the configured LLM to prioritize optional investigation tools." },
  { key: "organization_sharing", enabled: true, description: "Allow consent-based case sharing with organizations." },
  { key: "email_sending", enabled: true, description: "Allow user-approved sending through the configured email provider." },
];

export async function seedReference(db: DB) {
  for (const s of LEGAL_SOURCES) {
    await db
      .insert(legalSource)
      .values({ id: newId("src"), ...s, verifiedOn: SOURCE_VERIFIED_ON, status: "verified" })
      .onConflictDoUpdate({ target: legalSource.sourceKey, set: { title: s.title, url: s.url, publisher: s.publisher, verificationNote: s.verificationNote } });
  }
  for (const r of LEGAL_RULES) {
    const [existing] = await db.select().from(legalRule).where(eq(legalRule.ruleKey, r.ruleKey));
    if (existing) continue;
    const id = newId("rule");
    await db.insert(legalRule).values({ id, ruleKey: r.ruleKey, jurisdiction: "CA-NS", category: r.category, logicKey: r.logicKey, effectiveVersion: 1 });
    await db.insert(legalRuleVersion).values({
      id: newId("rv"),
      ruleId: id,
      version: 1,
      title: r.title,
      summary: r.summary,
      conditions: r.conditions,
      citation: r.citation,
      sourceKey: r.sourceKey,
      sourceExcerpt: r.sourceExcerpt,
      effectiveFrom: r.effectiveFrom ?? null,
      effectiveTo: r.effectiveTo ?? null,
      params: r.params ?? {},
      reviewStatus: "verified",
      verifiedOn: SOURCE_VERIFIED_ON,
      changeNote: "Initial version verified against the official source text.",
    });
  }
  const sources = [
    { sourceKey: "demo_inventory", name: "SafeLease demo inventory", kind: "demo_inventory" as const, attribution: "Fictional demonstration data" },
    { sourceKey: "partner_feed", name: "Licensed partner feed", kind: "licensed_feed" as const, attribution: "Configured via RENTAL_FEED_URL" },
    { sourceKey: "user_import", name: "Renter-imported listing", kind: "user_import" as const, attribution: "Supplied by the renter" },
    { sourceKey: "kijiji_link", name: "Kijiji (link only)", kind: "external_link" as const, attribution: "External platform — not fetched", termsUrl: "https://www.kijiji.ca" },
    { sourceKey: "facebook_link", name: "Facebook Marketplace (link only)", kind: "external_link" as const, attribution: "External platform — not fetched", termsUrl: "https://www.facebook.com/marketplace" },
    { sourceKey: "rentals_ca_link", name: "Rentals.ca (link only)", kind: "external_link" as const, attribution: "External platform — not fetched", termsUrl: "https://rentals.ca" },
    { sourceKey: "realtor_link", name: "REALTOR.ca (link only)", kind: "external_link" as const, attribution: "External platform — not fetched", termsUrl: "https://www.realtor.ca" },
  ];
  for (const s of sources) await db.insert(listingSource).values({ id: newId("ls"), ...s }).onConflictDoNothing();
  for (const f of FEATURE_FLAGS) await db.insert(featureFlag).values(f).onConflictDoNothing();
  const [job] = await db.select().from(monitoringJob).where(eq(monitoringJob.jobType, "legal_source_review"));
  if (!job) {
    await db.insert(monitoringJob).values({ id: newId("job"), jobType: "legal_source_review", targetType: "legal_sources", intervalHours: 24 * 7, nextRunAt: new Date() });
    await db.insert(monitoringJob).values({ id: newId("job"), jobType: "retention_cleanup", targetType: "documents", intervalHours: 24, nextRunAt: new Date() });
    await db.insert(monitoringJob).values({ id: newId("job"), jobType: "deposit_deadline_reminder", targetType: "all_deposits", intervalHours: 24, nextRunAt: new Date() });
    await db.insert(monitoringJob).values({ id: newId("job"), jobType: "maintenance_followup", targetType: "all_maintenance", intervalHours: 24, nextRunAt: new Date() });
    await db.insert(monitoringJob).values({ id: newId("job"), jobType: "saved_search_refresh", targetType: "all_saved_searches", intervalHours: 12, nextRunAt: new Date() });
  }
}
