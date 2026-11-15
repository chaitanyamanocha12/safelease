/**
 * Rental listing source adapters.
 *  - demo_inventory: fictional seeded listings, always labeled DEMO
 *  - partner_feed:   a licensed JSON feed (RENTAL_FEED_URL) when configured
 *  - external links: platform search URLs only — no scraping, no login bypass
 */
import { and, eq, gte, lte, isNull, or, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { listingImage, rentalListing } from "../db/schema";
import { env } from "../env";
import { newId } from "@/lib/ids";
import { haversineKm, ANCHORS } from "@/lib/geo";
import type { DiscoverFilters, NormalizedListing } from "@/lib/discover";
import { fetchJson, safeErrorMessage } from "./http";
import type { ProviderInfo, ProviderResult, ProviderStatus } from "./types";

export interface ListingSourceAdapter {
  key: string;
  searchListings(filters: DiscoverFilters): Promise<ProviderResult<NormalizedListing[]>>;
  getListingDetails(id: string): Promise<NormalizedListing | null>;
  getProviderStatus(): ProviderStatus;
  getAttribution(): string;
  getFreshness(): string;
  getSourceUrl(): string | null;
  info(): ProviderInfo;
}

type ListingRow = typeof rentalListing.$inferSelect;

export function rowToNormalized(r: ListingRow, images: string[], sourceName: string, sourceKind: NormalizedListing["sourceKind"], anchor?: { lat: number; lng: number } | null): NormalizedListing {
  return {
    id: r.id,
    sourceKey: r.sourceKey,
    sourceName,
    sourceKind,
    isDemo: r.isDemo,
    sourceUrl: r.sourceUrl,
    title: r.title,
    description: r.description,
    address: r.address,
    neighbourhood: r.neighbourhood,
    city: r.city,
    lat: r.lat,
    lng: r.lng,
    coordinatesSource: r.coordinatesSource,
    rentCents: r.rentCents,
    depositCents: r.depositCents,
    upfrontFeesCents: r.upfrontFeesCents,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    propertyType: r.propertyType,
    furnished: r.furnished,
    parking: r.parking,
    petsAllowed: r.petsAllowed,
    utilitiesIncluded: r.utilitiesIncluded,
    accessibilityFeatures: r.accessibilityFeatures,
    features: r.features,
    leaseType: r.leaseType,
    availableFrom: r.availableFrom,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    retrievedAt: r.retrievedAt.toISOString(),
    availabilityStatus: r.availabilityStatus,
    dataConfidence: r.dataConfidence,
    imageUrls: images,
    distanceKm: anchor && r.lat !== null && r.lng !== null ? Math.round(haversineKm(anchor, { lat: r.lat, lng: r.lng }) * 10) / 10 : null,
  };
}

async function queryStoredListings(sourceKeys: string[], f: DiscoverFilters, ownerId: string | null): Promise<NormalizedListing[]> {
  const conds = [inArray(rentalListing.sourceKey, sourceKeys), ownerId ? or(isNull(rentalListing.ownerId), eq(rentalListing.ownerId, ownerId)) : isNull(rentalListing.ownerId)];
  if (f.city) conds.push(sql`lower(${rentalListing.city}) = ${f.city.toLowerCase()}`);
  if (f.neighbourhood) conds.push(sql`lower(${rentalListing.neighbourhood}) like ${`%${f.neighbourhood.toLowerCase()}%`}`);
  if (f.budgetMin !== undefined) conds.push(gte(rentalListing.rentCents, Math.round(f.budgetMin * 100)));
  if (f.budgetMax !== undefined) conds.push(lte(rentalListing.rentCents, Math.round(f.budgetMax * 100)));
  if (f.bedroomsMin !== undefined) conds.push(gte(rentalListing.bedrooms, f.bedroomsMin));
  if (f.bathroomsMin !== undefined) conds.push(gte(rentalListing.bathrooms, f.bathroomsMin));
  if (f.propertyType) conds.push(eq(rentalListing.propertyType, f.propertyType));
  if (f.furnished === "yes") conds.push(eq(rentalListing.furnished, true));
  if (f.furnished === "no") conds.push(eq(rentalListing.furnished, false));
  if (f.pets) conds.push(eq(rentalListing.petsAllowed, true));
  if (f.moveInBy) conds.push(lte(rentalListing.availableFrom, f.moveInBy));
  const rows = await db.select().from(rentalListing).where(and(...conds)).limit(200);
  const imgs = rows.length
    ? await db.select().from(listingImage).where(inArray(listingImage.listingId, rows.map((r) => r.id)))
    : [];
  const anchor = f.anchorKey ? ANCHORS.find((a) => a.key === f.anchorKey) ?? null : null;
  let out = rows.map((r) =>
    rowToNormalized(
      r,
      imgs.filter((i) => i.listingId === r.id && i.url).sort((a, b) => a.position - b.position).map((i) => i.url!),
      r.isDemo ? "SafeLease demo inventory" : r.sourceKey === "partner_feed" ? env().RENTAL_FEED_NAME : "Your imported listing",
      r.isDemo ? "demo_inventory" : r.sourceKey === "partner_feed" ? "licensed_feed" : "user_import",
      anchor,
    ),
  );
  if (f.parking) out = out.filter((l) => l.parking && !/^(none|no)/i.test(l.parking));
  if (f.heatIncluded) out = out.filter((l) => l.utilitiesIncluded.some((u) => /heat/i.test(u)));
  if (f.accessible) out = out.filter((l) => l.accessibilityFeatures.length > 0);
  if (anchor && f.radiusKm) out = out.filter((l) => l.distanceKm === null || l.distanceKm <= f.radiusKm!);
  return out;
}

export class DemoInventoryAdapter implements ListingSourceAdapter {
  key = "demo_inventory";
  constructor(private ownerId: string | null = null) {}
  info(): ProviderInfo {
    return {
      id: "demo_inventory",
      category: "listings",
      name: "SafeLease demo inventory",
      description: "Fictional example listings for demonstrating discovery. Not real, not available, not market data.",
      capabilities: ["search", "details"],
      status: "DEMO",
      statusMessage: "DEMO: fictional listings with approximate neighbourhood locations. Never mixed with live results without labels.",
      requiredEnv: [],
    };
  }
  getProviderStatus(): ProviderStatus {
    return "DEMO";
  }
  getAttribution() {
    return "Fictional SafeLease demonstration data";
  }
  getFreshness() {
    return "Static demo data (seeded)";
  }
  getSourceUrl() {
    return null;
  }
  async searchListings(f: DiscoverFilters): Promise<ProviderResult<NormalizedListing[]>> {
    const data = await queryStoredListings(["demo_inventory", "user_import"], f, this.ownerId);
    return { ok: true, mode: "DEMO", providerId: this.key, retrievedAt: new Date(), data };
  }
  async getListingDetails(id: string) {
    const rows = await queryStoredListings(["demo_inventory", "user_import"], {}, this.ownerId);
    return rows.find((r) => r.id === id) ?? null;
  }
}

const feedItemSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  url: z.string().url().optional(),
  address: z.string().max(200).optional(),
  neighbourhood: z.string().max(80).optional(),
  city: z.string().min(1).max(80),
  province: z.string().max(4).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  rent: z.number().min(0).max(50000).optional(),
  deposit: z.number().min(0).max(50000).optional(),
  bedrooms: z.number().int().min(0).max(10).optional(),
  bathrooms: z.number().min(0).max(10).optional(),
  propertyType: z.string().max(30).optional(),
  furnished: z.boolean().optional(),
  parking: z.string().max(80).optional(),
  petsAllowed: z.boolean().optional(),
  utilitiesIncluded: z.array(z.string().max(30)).max(10).optional(),
  features: z.array(z.string().max(60)).max(30).optional(),
  availableFrom: z.string().max(20).optional(),
  publishedAt: z.string().max(40).optional(),
  images: z.array(z.string().url()).max(12).optional(),
});

export class PartnerFeedAdapter implements ListingSourceAdapter {
  key = "partner_feed";
  configured() {
    return Boolean(env().RENTAL_FEED_URL);
  }
  info(): ProviderInfo {
    return {
      id: "partner_feed",
      category: "listings",
      name: env().RENTAL_FEED_NAME,
      description: "Licensed rental feed in the SafeLease JSON feed format (see API_INTEGRATIONS.md). Requires a data-sharing agreement with the provider.",
      capabilities: ["search", "details"],
      status: this.configured() ? "LIVE" : "NOT_CONFIGURED",
      statusMessage: this.configured() ? "Feed URL configured; results are labeled with the feed name and retrieval time." : "Set RENTAL_FEED_URL (and RENTAL_FEED_API_KEY) after obtaining a licensed feed.",
      requiredEnv: ["RENTAL_FEED_URL", "RENTAL_FEED_API_KEY"],
      timeoutMs: 15000,
      retries: 1,
    };
  }
  getProviderStatus(): ProviderStatus {
    return this.configured() ? "LIVE" : "NOT_CONFIGURED";
  }
  getAttribution() {
    return env().RENTAL_FEED_NAME;
  }
  getFreshness() {
    return "Fetched on each search";
  }
  getSourceUrl() {
    return env().RENTAL_FEED_URL ?? null;
  }
  async searchListings(f: DiscoverFilters): Promise<ProviderResult<NormalizedListing[]>> {
    if (!this.configured()) return { ok: false, status: "NOT_CONFIGURED", providerId: this.key, message: "No licensed listing feed configured." };
    try {
      const e = env();
      const raw = await fetchJson<unknown>(e.RENTAL_FEED_URL!, {
        timeoutMs: 15000,
        retries: 1,
        headers: e.RENTAL_FEED_API_KEY ? { Authorization: `Bearer ${e.RENTAL_FEED_API_KEY}`, Accept: "application/json" } : { Accept: "application/json" },
      });
      const items = z.object({ listings: z.array(z.unknown()).max(2000) }).parse(raw).listings;
      const now = new Date();
      for (const it of items) {
        const p = feedItemSchema.safeParse(it);
        if (!p.success) continue;
        const v = p.data;
        const values = {
          sourceKey: "partner_feed",
          externalId: v.id,
          isDemo: false,
          title: v.title,
          address: v.address ?? null,
          neighbourhood: v.neighbourhood ?? null,
          city: v.city,
          province: v.province ?? "NS",
          lat: v.lat ?? null,
          lng: v.lng ?? null,
          coordinatesSource: (v.lat !== undefined ? "provider" : "none") as "provider" | "none",
          rentCents: v.rent !== undefined ? Math.round(v.rent * 100) : null,
          depositCents: v.deposit !== undefined ? Math.round(v.deposit * 100) : null,
          bedrooms: v.bedrooms ?? null,
          bathrooms: v.bathrooms ?? null,
          furnished: v.furnished ?? null,
          parking: v.parking ?? null,
          petsAllowed: v.petsAllowed ?? null,
          utilitiesIncluded: v.utilitiesIncluded ?? [],
          features: v.features ?? [],
          availableFrom: v.availableFrom ?? null,
          publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
          retrievedAt: now,
          sourceUrl: v.url ?? null,
          dataConfidence: "medium" as const,
          updatedAt: now,
        };
        await db
          .insert(rentalListing)
          .values({ id: newId("lst"), ...values })
          .onConflictDoUpdate({ target: [rentalListing.sourceKey, rentalListing.externalId], set: values });
      }
      const data = await queryStoredListings(["partner_feed"], f, null);
      return { ok: true, mode: "LIVE", providerId: this.key, retrievedAt: now, data };
    } catch (err) {
      return { ok: false, status: "UNAVAILABLE", providerId: this.key, message: `Feed unavailable: ${safeErrorMessage(err)}` };
    }
  }
  async getListingDetails(id: string) {
    const rows = await queryStoredListings(["partner_feed"], {}, null);
    return rows.find((r) => r.id === id) ?? null;
  }
}

export interface ExternalSearchLink {
  platform: string;
  url: string;
  note: string;
}

/** Platform search links. SafeLease does not fetch or scrape these platforms. */
export function externalSearchLinks(f: DiscoverFilters): ExternalSearchLink[] {
  const city = (f.city || "Halifax").trim();
  const q = encodeURIComponent(`${f.bedroomsMin ? `${f.bedroomsMin} bedroom ` : ""}${f.neighbourhood ? `${f.neighbourhood} ` : ""}${city} rental`);
  const note = "Opens the platform in a new tab. Listings there have not been checked by SafeLease — import any you're considering by pasting text or a screenshot.";
  const fb = new URLSearchParams();
  if (f.budgetMin) fb.set("minPrice", String(Math.round(f.budgetMin)));
  if (f.budgetMax) fb.set("maxPrice", String(Math.round(f.budgetMax)));
  if (f.bedroomsMin) fb.set("minBedrooms", String(f.bedroomsMin));
  return [
    { platform: "Kijiji", url: `https://www.kijiji.ca/b-for-rent/${encodeURIComponent(city.toLowerCase())}/${q}/k0c30349001`, note },
    { platform: "Facebook Marketplace", url: `https://www.facebook.com/marketplace/${encodeURIComponent(city.toLowerCase())}/propertyrentals?${fb.toString()}`, note: `${note} Requires a Facebook login.` },
    { platform: "Rentals.ca", url: `https://rentals.ca/${encodeURIComponent(city.toLowerCase())}`, note },
    { platform: "REALTOR.ca (rentals)", url: `https://www.realtor.ca/map#TransactionTypeId=3&Sort=6-D&GeoName=${encodeURIComponent(`${city}, NS`)}`, note },
  ];
}

export function listingAdapters(ownerId: string | null): ListingSourceAdapter[] {
  return [new PartnerFeedAdapter(), new DemoInventoryAdapter(ownerId)];
}
