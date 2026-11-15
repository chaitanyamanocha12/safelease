/**
 * Discovery: multi-source search with per-provider status, saved properties,
 * saved searches, user imports, and explainable comparison.
 * Demo results are always marked isDemo; live and demo are never merged unlabeled.
 */
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { finding, investigation, listingImage, propertyComparison, rentalListing, savedProperty, savedSearch, searchRun, verificationCheck } from "../db/schema";
import { newId } from "@/lib/ids";
import { AppError, notFound } from "../errors";
import { formatCents, parseMoneyToCents } from "@/lib/money";
import { ANCHORS, haversineKm } from "@/lib/geo";
import { DEFAULT_WEIGHTS, dedupeListings, rankListings, type DiscoverFilters, type NormalizedListing, type RankingWeights } from "@/lib/discover";
import { externalSearchLinks, listingAdapters, rowToNormalized } from "../providers/listings";
import { extractClaims } from "../extraction/extract-claims";
import { addEvidence, createInvestigation } from "./investigations";

export interface ProviderSearchStatus {
  sourceKey: string;
  name: string;
  status: string;
  count: number;
  message?: string;
}

export async function searchRentals(userId: string, f: DiscoverFilters, opts: { record?: boolean; savedSearchId?: string; originInvestigationId?: string } = {}) {
  const adapters = listingAdapters(userId);
  const statuses: ProviderSearchStatus[] = [];
  let results: NormalizedListing[] = [];
  for (const a of adapters) {
    const r = await a.searchListings(f);
    if (r.ok) {
      statuses.push({ sourceKey: a.key, name: a.info().name, status: r.mode === "DEMO" ? "DEMO" : "LIVE", count: r.data.length });
      results.push(...r.data);
    } else {
      statuses.push({ sourceKey: a.key, name: a.info().name, status: r.status, count: 0, message: r.message });
    }
  }
  results = dedupeListings(results);
  const sort = f.sort ?? (f.anchorKey ? "distance" : "relevance");
  results.sort((a, b) => {
    if (sort === "price_asc") return (a.rentCents ?? 1e12) - (b.rentCents ?? 1e12);
    if (sort === "price_desc") return (b.rentCents ?? 0) - (a.rentCents ?? 0);
    if (sort === "distance") return (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9);
    if (sort === "newest") return (b.publishedAt ?? b.retrievedAt).localeCompare(a.publishedAt ?? a.retrievedAt);
    // relevance: live before demo, then price
    return Number(a.isDemo) - Number(b.isDemo) || (a.rentCents ?? 0) - (b.rentCents ?? 0);
  });
  const page = f.page ?? 1;
  const pageSize = 24;
  if (opts.record !== false) {
    await db.insert(searchRun).values({ id: newId("srun"), userId, savedSearchId: opts.savedSearchId ?? null, originInvestigationId: opts.originInvestigationId ?? null, filters: f as Record<string, unknown>, providerResults: statuses, resultCount: results.length });
  }
  return { total: results.length, page, pageSize, results: results.slice((page - 1) * pageSize, page * pageSize), allForMap: results, statuses, externalLinks: externalSearchLinks(f) };
}

export async function getListingForUser(userId: string, id: string): Promise<NormalizedListing> {
  const [r] = await db.select().from(rentalListing).where(and(eq(rentalListing.id, id), or(isNull(rentalListing.ownerId), eq(rentalListing.ownerId, userId))));
  if (!r) throw notFound("Listing");
  const imgs = await db.select().from(listingImage).where(eq(listingImage.listingId, id)).orderBy(listingImage.position);
  return rowToNormalized(r, imgs.filter((i) => i.url).map((i) => i.url!), r.isDemo ? "SafeLease demo inventory" : r.sourceKey === "partner_feed" ? "Licensed partner feed" : "Your imported listing", r.isDemo ? "demo_inventory" : r.sourceKey === "partner_feed" ? "licensed_feed" : "user_import");
}

export async function saveProperty(userId: string, listingId: string, notes?: string) {
  await getListingForUser(userId, listingId);
  await db.insert(savedProperty).values({ id: newId("sav"), userId, listingId, notes: notes ?? null }).onConflictDoNothing();
}

export async function unsaveProperty(userId: string, listingId: string) {
  await db.delete(savedProperty).where(and(eq(savedProperty.userId, userId), eq(savedProperty.listingId, listingId)));
}

export async function updateSaved(userId: string, listingId: string, patch: { notes?: string | null; watch?: boolean; inComparison?: boolean; investigationId?: string | null }) {
  const [s] = await db.select().from(savedProperty).where(and(eq(savedProperty.userId, userId), eq(savedProperty.listingId, listingId)));
  if (!s) {
    await saveProperty(userId, listingId);
  }
  if (patch.inComparison) {
    const n = await db.select({ id: savedProperty.id }).from(savedProperty).where(and(eq(savedProperty.userId, userId), eq(savedProperty.inComparison, true)));
    if (n.length >= 6 && !s?.inComparison) throw new AppError("CONFLICT", "Compare up to 6 properties at a time.");
  }
  await db.update(savedProperty).set({ ...patch, updatedAt: new Date() }).where(and(eq(savedProperty.userId, userId), eq(savedProperty.listingId, listingId)));
}

export async function listSaved(userId: string) {
  const rows = await db.select({ s: savedProperty, l: rentalListing }).from(savedProperty).innerJoin(rentalListing, eq(rentalListing.id, savedProperty.listingId)).where(eq(savedProperty.userId, userId)).orderBy(desc(savedProperty.updatedAt));
  const imgs = rows.length ? await db.select().from(listingImage).where(inArray(listingImage.listingId, rows.map((r) => r.l.id))) : [];
  const invIds = rows.map((r) => r.s.investigationId).filter((x): x is string => Boolean(x));
  const findings = invIds.length ? await db.select({ inv: finding.investigationId, sev: finding.severity }).from(finding).where(and(inArray(finding.investigationId, invIds), eq(finding.lifecycle, "active"))) : [];
  return rows.map((r) => ({
    saved: r.s,
    listing: rowToNormalized(r.l, imgs.filter((i) => i.listingId === r.l.id && i.url).map((i) => i.url!), r.l.isDemo ? "SafeLease demo inventory" : "Listing source", r.l.isDemo ? "demo_inventory" : r.l.sourceKey === "partner_feed" ? "licensed_feed" : "user_import"),
    serious: findings.filter((f) => f.inv === r.s.investigationId && f.sev === "serious").length,
    caution: findings.filter((f) => f.inv === r.s.investigationId && f.sev === "caution").length,
  }));
}

export async function saveSearch(userId: string, name: string, filters: DiscoverFilters, alertsEnabled: boolean) {
  const id = newId("ss");
  await db.insert(savedSearch).values({ id, userId, name: name.slice(0, 80), filters: filters as Record<string, unknown>, alertsEnabled });
  return id;
}

export async function listSavedSearches(userId: string) {
  return db.select().from(savedSearch).where(eq(savedSearch.userId, userId)).orderBy(desc(savedSearch.createdAt));
}

export async function deleteSavedSearch(userId: string, id: string) {
  await db.delete(savedSearch).where(and(eq(savedSearch.id, id), eq(savedSearch.userId, userId)));
}

/** Import a listing the user found elsewhere (pasted text). Stays private to the user. */
export async function importListing(userId: string, input: { text: string; sourceUrl?: string | null; platform?: string | null; createInvestigation?: boolean }) {
  const claims = extractClaims(input.text, { sourceKind: "listing" });
  const g = (t: string) => claims.find((c) => c.claimType === t);
  const title = g("listing_title")?.value ?? "Imported listing";
  const city = g("city")?.value ?? "Halifax";
  const id = newId("lst");
  await db.insert(rentalListing).values({
    id,
    sourceKey: "user_import",
    externalId: id,
    ownerId: userId,
    isDemo: false,
    title: title.slice(0, 160),
    description: input.text.slice(0, 4000),
    address: g("address")?.value ?? null,
    city,
    rentCents: g("rent") ? Number(g("rent")!.normalized) : null,
    depositCents: g("deposit") ? Number(g("deposit")!.normalized) : null,
    bedrooms: g("bedrooms") ? Number(g("bedrooms")!.normalized) : null,
    bathrooms: g("bathrooms") ? Number(g("bathrooms")!.normalized) : null,
    utilitiesIncluded: (g("utilities")?.normalized.startsWith("included:") ? g("utilities")!.normalized.split(":")[1]!.split(",") : []),
    parking: g("parking")?.value ?? null,
    sourceUrl: input.sourceUrl ?? null,
    dataConfidence: "low",
    availabilityStatus: "unverified",
    contactName: g("contact_name")?.value ?? null,
  });
  await saveProperty(userId, id);
  let investigationId: string | null = null;
  if (input.createInvestigation) {
    investigationId = await createInvestigation(userId, { title, city, listingId: id });
    await addEvidence(userId, investigationId, { kind: "listing_text", title: `Imported from ${input.platform ?? "another platform"}`, text: input.text, sourceUrl: input.sourceUrl ?? null });
    await updateSaved(userId, id, { investigationId });
  }
  return { listingId: id, investigationId };
}

export async function investigationFromListing(userId: string, listingId: string) {
  const l = await getListingForUser(userId, listingId);
  const lines = [
    l.title,
    l.address ? `${l.address}, ${l.city}` : `${l.neighbourhood ?? ""} ${l.city}`.trim(),
    l.rentCents ? `${formatCents(l.rentCents)}/month` : "",
    l.depositCents ? `Security deposit of ${formatCents(l.depositCents)}` : "",
    l.bedrooms !== null ? `${l.bedrooms} bedroom` : "",
    l.bathrooms !== null ? `${l.bathrooms} bathroom` : "",
    l.utilitiesIncluded.length ? `${l.utilitiesIncluded.join(", ")} included` : "",
    l.parking ? l.parking : "",
    l.description ?? "",
  ].filter(Boolean);
  const invId = await createInvestigation(userId, { title: l.title, city: l.city, listingId, isDemo: l.isDemo });
  await addEvidence(userId, invId, {
    kind: "manual_entry",
    title: l.isDemo ? "Listing details from SafeLease DEMO inventory (fictional)" : `Listing details from ${l.sourceName}`,
    text: lines.join("\n"),
    sourceUrl: l.sourceUrl,
  });
  await updateSaved(userId, listingId, { investigationId: invId });
  return invId;
}

// ── Comparison ────────────────────────────────────────────────────────────

export async function getComparison(userId: string, opts: { originInvestigationId?: string | null; anchorKey?: string | null; weights?: Partial<RankingWeights> } = {}) {
  const [stored] = await db.select().from(propertyComparison).where(eq(propertyComparison.userId, userId)).orderBy(desc(propertyComparison.updatedAt)).limit(1);
  const weights = { ...DEFAULT_WEIGHTS, ...(stored?.weights ?? {}), ...(opts.weights ?? {}) } as RankingWeights;
  const saved = (await listSaved(userId)).filter((s) => s.saved.inComparison);
  const anchorDef = opts.anchorKey ? ANCHORS.find((a) => a.key === opts.anchorKey) : stored?.anchor ? { ...stored.anchor, key: "stored", label: stored.anchor.label } : ANCHORS[0];
  const anchor = anchorDef ? { lat: anchorDef.lat, lng: anchorDef.lng } : null;
  const invIds = saved.map((s) => s.saved.investigationId).filter((x): x is string => Boolean(x));
  const checks = invIds.length ? await db.select({ inv: verificationCheck.investigationId, status: verificationCheck.status }).from(verificationCheck).where(inArray(verificationCheck.investigationId, invIds)) : [];

  const evidenceScore = (invId: string | null) => {
    if (!invId) return null;
    const cs = checks.filter((c) => c.inv === invId);
    if (cs.length === 0) return 0.2;
    return cs.filter((c) => c.status === "supported").length / Math.max(5, cs.length);
  };
  const inputs = saved.map((s) => ({ listing: { ...s.listing, distanceKm: anchor && s.listing.lat !== null && s.listing.lng !== null ? Math.round(haversineKm(anchor, { lat: s.listing.lat, lng: s.listing.lng }) * 10) / 10 : null }, evidenceScore: evidenceScore(s.saved.investigationId), seriousFindings: s.serious }));

  // Original listing from an investigation (as a pseudo-candidate)
  let origin: { investigationId: string; title: string; rentCents: number | null; bedrooms: number | null; serious: number } | null = null;
  const originId = opts.originInvestigationId ?? stored?.originInvestigationId ?? null;
  if (originId) {
    const [inv] = await db.select().from(investigation).where(and(eq(investigation.id, originId), eq(investigation.ownerId, userId)));
    if (inv) {
      const { claim } = await import("../db/schema");
      const cs = await db.select().from(claim).where(and(eq(claim.investigationId, inv.id), isNull(claim.supersededAt)));
      const fs = await db.select({ sev: finding.severity }).from(finding).where(and(eq(finding.investigationId, inv.id), eq(finding.lifecycle, "active")));
      const rent = cs.find((c) => c.claimType === "rent");
      const beds = cs.find((c) => c.claimType === "bedrooms");
      origin = { investigationId: inv.id, title: inv.title, rentCents: rent ? Number(rent.normalized) : null, bedrooms: beds ? Number(beds.normalized) : null, serious: fs.filter((f) => f.sev === "serious").length };
    }
  }
  const ranked = inputs.length ? rankListings(inputs, weights, anchor) : [];
  return { weights, anchor: anchorDef ?? null, ranked, saved, origin };
}

export async function saveComparisonPrefs(userId: string, prefs: { weights: RankingWeights; anchorKey?: string | null; originInvestigationId?: string | null }) {
  const anchorDef = prefs.anchorKey ? ANCHORS.find((a) => a.key === prefs.anchorKey) : null;
  const [stored] = await db.select().from(propertyComparison).where(eq(propertyComparison.userId, userId)).limit(1);
  const values = { weights: prefs.weights, anchor: anchorDef ? { lat: anchorDef.lat, lng: anchorDef.lng, label: anchorDef.label } : null, originInvestigationId: prefs.originInvestigationId ?? null, updatedAt: new Date() };
  if (stored) await db.update(propertyComparison).set(values).where(eq(propertyComparison.id, stored.id));
  else await db.insert(propertyComparison).values({ id: newId("cmp"), userId, name: "My comparison", listingIds: [], ...values });
}

void sql;
void parseMoneyToCents;
