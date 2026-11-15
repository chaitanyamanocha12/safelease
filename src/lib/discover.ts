/** Shared (client + server) discovery types, filter schema and ranking. */
import { z } from "zod";
import { haversineKm, type LatLng } from "./geo";

export const PROPERTY_TYPES = ["apartment", "house", "townhouse", "basement_suite", "room", "condo", "duplex", "other"] as const;

export const discoverFiltersSchema = z.object({
  city: z.string().max(60).optional(),
  neighbourhood: z.string().max(60).optional(),
  anchorKey: z.string().max(40).optional(),
  radiusKm: z.coerce.number().min(0.5).max(50).optional(),
  budgetMin: z.coerce.number().min(0).max(20000).optional(),
  budgetMax: z.coerce.number().min(0).max(20000).optional(),
  bedroomsMin: z.coerce.number().int().min(0).max(8).optional(),
  bathroomsMin: z.coerce.number().min(0).max(6).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  furnished: z.enum(["any", "yes", "no"]).optional(),
  parking: z.coerce.boolean().optional(),
  pets: z.coerce.boolean().optional(),
  heatIncluded: z.coerce.boolean().optional(),
  accessible: z.coerce.boolean().optional(),
  moveInBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(["relevance", "price_asc", "price_desc", "distance", "newest"]).optional(),
  page: z.coerce.number().int().min(1).max(100).optional(),
});
export type DiscoverFilters = z.infer<typeof discoverFiltersSchema>;

export interface NormalizedListing {
  id: string;
  sourceKey: string;
  sourceName: string;
  sourceKind: "demo_inventory" | "licensed_feed" | "external_link" | "user_import";
  isDemo: boolean;
  sourceUrl: string | null;
  title: string;
  description: string | null;
  address: string | null;
  neighbourhood: string | null;
  city: string;
  lat: number | null;
  lng: number | null;
  coordinatesSource: string;
  rentCents: number | null;
  depositCents: number | null;
  upfrontFeesCents: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  furnished: boolean | null;
  parking: string | null;
  petsAllowed: boolean | null;
  utilitiesIncluded: string[];
  accessibilityFeatures: string[];
  features: string[];
  leaseType: string | null;
  availableFrom: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  availabilityStatus: string;
  dataConfidence: string;
  imageUrls: string[];
  distanceKm: number | null;
}

export const DEFAULT_WEIGHTS = { price: 3, distance: 2, space: 2, amenities: 1, evidence: 2 } as const;
export type RankingWeights = Record<keyof typeof DEFAULT_WEIGHTS, number>;

export interface RankingInput {
  listing: NormalizedListing;
  /** 0..1: share of verification checks completed and no serious findings. */
  evidenceScore: number | null;
  seriousFindings: number;
}

export interface RankedListing {
  listing: NormalizedListing;
  score: number;
  components: Record<keyof RankingWeights, number>;
  reasons: string[];
}

/**
 * Explainable, user-weighted ranking. Lower price scores higher within the
 * candidate set, but price never enters any risk assessment.
 */
export function rankListings(inputs: RankingInput[], weights: RankingWeights, anchor?: LatLng | null): RankedListing[] {
  const rents = inputs.map((i) => i.listing.rentCents).filter((x): x is number => x !== null);
  const minR = Math.min(...rents);
  const maxR = Math.max(...rents);
  const dists = inputs
    .map((i) => (anchor && i.listing.lat !== null && i.listing.lng !== null ? haversineKm(anchor, { lat: i.listing.lat, lng: i.listing.lng }) : null))
    .filter((x): x is number => x !== null);
  const maxD = Math.max(...dists, 0.0001);
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  return inputs
    .map(({ listing, evidenceScore, seriousFindings }) => {
      const price = listing.rentCents === null || maxR === minR ? 0.5 : 1 - (listing.rentCents - minR) / (maxR - minR);
      const d = anchor && listing.lat !== null && listing.lng !== null ? haversineKm(anchor, { lat: listing.lat, lng: listing.lng }) : null;
      const distance = d === null ? 0.5 : 1 - d / maxD;
      const space = Math.min(1, ((listing.bedrooms ?? 0) * 0.6 + (listing.bathrooms ?? 0) * 0.4) / 3);
      const amen = Math.min(1, (listing.utilitiesIncluded.length + listing.features.length * 0.5 + (listing.parking && !/none|no/i.test(listing.parking) ? 1 : 0)) / 6);
      const evidence = evidenceScore === null ? 0.3 : Math.max(0, evidenceScore - seriousFindings * 0.3);
      const components = { price, distance, space, amenities: amen, evidence };
      const score = (Object.keys(weights) as Array<keyof RankingWeights>).reduce((s, k) => s + components[k] * weights[k], 0) / totalW;
      const reasons: string[] = [];
      if (weights.price > 0 && price >= 0.7) reasons.push("Lower rent than most candidates");
      if (weights.distance > 0 && d !== null && distance >= 0.7) reasons.push(`Close to your chosen location (${d.toFixed(1)} km straight-line)`);
      if (weights.space > 0 && space >= 0.6) reasons.push("More space (bedrooms/bathrooms)");
      if (weights.amenities > 0 && amen >= 0.5) reasons.push("More included utilities or amenities");
      if (weights.evidence > 0 && evidenceScore !== null && evidence >= 0.6) reasons.push("More verification evidence collected");
      if (evidenceScore === null) reasons.push("Not yet investigated — evidence score is neutral-low");
      if (seriousFindings > 0) reasons.push(`${seriousFindings} serious finding(s) lower its evidence score`);
      return { listing, score: Math.round(score * 1000) / 1000, components, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

/** Deduplicate the same unit appearing from multiple sources/imports. */
export function listingDedupeKey(l: Pick<NormalizedListing, "address" | "rentCents" | "bedrooms" | "title">): string {
  const addr = (l.address ?? l.title)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(street|st)\b/g, "st")
    .replace(/\b(unit|apt|suite)\s*\w+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${addr}|${l.bedrooms ?? "?"}|${l.rentCents ?? "?"}`;
}

export function dedupeListings<T extends NormalizedListing>(listings: T[]): T[] {
  const seen = new Map<string, T>();
  for (const l of listings) {
    const k = listingDedupeKey(l);
    const prev = seen.get(k);
    // Prefer non-demo, then higher confidence
    if (!prev || (prev.isDemo && !l.isDemo)) seen.set(k, l);
  }
  return [...seen.values()];
}
