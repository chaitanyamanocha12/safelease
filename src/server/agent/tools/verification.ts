/**
 * Verification and research tools. Provider-backed tools report LIVE only
 * when a real provider answered; otherwise NOT_CONFIGURED / UNAVAILABLE.
 * Nothing here can mark rental authority as verified — only the renter's
 * own documented independent verification can.
 */
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { document, documentVersion, evidence, imageFingerprint, investigation, listingImage, rentalListing } from "../../db/schema";
import { formatCents } from "@/lib/money";
import { NominatimGeocoder } from "../../providers/geo-providers";
import { BraveSearch, GoogleVisionWebDetection } from "../../providers/research";
import { DemoInventoryAdapter } from "../../providers/listings";
import { compareFingerprints } from "../../images/fingerprint";
import { activeClaims, byType, centsOf } from "../../investigation/active";
import type { ImageMatchRecord } from "../../investigation/types";
import { storage } from "../../storage";
import { proposeAction, upsertCheck } from "../../services/investigations";
import { hashOf, type AgentTool } from "./types";

export const verifyAddress: AgentTool<{ address: string; city: string }> = {
  name: "verify_address",
  label: "Address check",
  description: "Checks whether the stated address matches a known address (OpenStreetMap Nominatim). Address existence is not rental authority.",
  category: "verification",
  mandatory: false,
  permission: "external_read",
  candidates(s) {
    const addr = byType(activeClaims(s.snapshot), "address").sort((a, b) => b.extractedAt.getTime() - a.extractedAt.getTime())[0];
    if (!addr) return [];
    const city = byType(activeClaims(s.snapshot), "city")[0]?.value ?? s.inv.city ?? "Halifax";
    return [{ inputHash: hashOf([addr.normalized, city]), reason: "An address is stated but has not been checked.", inputSummary: `${addr.value}, ${city}`, input: { address: addr.value, city } }];
  },
  async run(ctx, s, input) {
    const geo = new NominatimGeocoder();
    const r = await geo.geocode(input.address, input.city);
    if (!r.ok) {
      await upsertCheck(s.inv.id, "address_validity", {
        status: "provider_unavailable",
        method: "Geocoding lookup",
        summary: r.status === "NOT_CONFIGURED" ? "No geocoding provider is configured, so the address was not checked." : `Geocoding provider unavailable: ${r.message}`,
        performedBy: "agent",
        providerId: "nominatim",
        providerMode: r.status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "LIVE",
      });
      return { status: r.status === "NOT_CONFIGURED" ? "not_configured" : "provider_unavailable", mode: "NONE", summary: r.message, stateChanged: true };
    }
    const matched = r.data.matched;
    await upsertCheck(s.inv.id, "address_validity", {
      status: matched ? "supported" : "unverified",
      method: "OpenStreetMap Nominatim lookup",
      summary: matched
        ? `The address matches an OpenStreetMap record (“${r.data.displayName}”). This supports that the address exists — not that the advertiser may rent it.`
        : "No matching OpenStreetMap address was found. Geocoders miss some addresses; confirm the civic address directly.",
      performedBy: "provider",
      providerId: "nominatim",
      providerMode: "LIVE",
      details: { ...r.data, retrievedAt: r.retrievedAt.toISOString(), attribution: "© OpenStreetMap contributors" },
    });
    return { status: "succeeded", mode: "LIVE", summary: matched ? "Address found in OpenStreetMap." : "Address not found in OpenStreetMap.", output: { matched, displayName: r.data.displayName }, stateChanged: true };
  },
};

const FREE_MAIL = /@(gmail|outlook|hotmail|yahoo|icloud|live|aol|proton(mail)?|gmx)\./i;

export const landlordBusinessResearch: AgentTool<{ query: string; names: string[] }> = {
  name: "landlord_business_research",
  label: "Public business research",
  description: "Searches the public web for the named property manager or business to find independently listed contact details. Results are leads for the renter to review.",
  category: "research",
  mandatory: false,
  permission: "external_read",
  candidates(s) {
    const c = activeClaims(s.snapshot);
    const names = [...new Set(byType(c, "contact_name").map((x) => x.value).filter((n) => n.includes(" ")))].slice(0, 2);
    const domains = [...new Set(byType(c, "contact_email").map((e) => e.value).filter((e) => !FREE_MAIL.test(e)).map((e) => e.split("@")[1]!))].slice(0, 1);
    if (names.length === 0 && domains.length === 0) return [];
    const query = `${[...names.map((n) => `"${n}"`), ...domains].join(" OR ")} property management Nova Scotia`;
    return [{ inputHash: hashOf(query), reason: "A named contact or business domain can be researched for independently listed details.", inputSummary: query, input: { query, names } }];
  },
  async run(ctx, s, input) {
    const r = await new BraveSearch().search(input.query, 5);
    if (!r.ok) {
      await upsertCheck(s.inv.id, "public_business_info", {
        status: "provider_unavailable",
        method: "Public web search",
        summary: r.status === "NOT_CONFIGURED" ? "Web research is not configured; search for the business yourself using its official website." : `Search provider unavailable: ${r.message}`,
        performedBy: "agent",
        providerId: "brave_search",
        providerMode: r.status === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "LIVE",
      });
      return { status: r.status === "NOT_CONFIGURED" ? "not_configured" : "provider_unavailable", mode: "NONE", summary: r.message, stateChanged: true };
    }
    await upsertCheck(s.inv.id, "public_business_info", {
      status: "unverified",
      method: "Public web search (Brave)",
      summary: r.data.length
        ? `${r.data.length} public result(s) found. These are leads only — compare any phone/email on an official site with what the advertiser gave you.`
        : "No public results found for this name. Absence of results is not evidence either way.",
      performedBy: "provider",
      providerId: "brave_search",
      providerMode: "LIVE",
      details: { query: input.query, results: r.data, retrievedAt: r.retrievedAt.toISOString() },
    });
    return { status: "succeeded", mode: "LIVE", summary: `${r.data.length} public result(s) recorded as unverified leads.`, output: { resultCount: r.data.length }, stateChanged: true };
  },
};

export const imageReuseCheck: AgentTool<{ fingerprintIds: string[] }> = {
  name: "image_reuse_check",
  label: "Local image reuse check",
  description: "Compares perceptual fingerprints of case photos with your other cases and with listing images in SafeLease (local only).",
  category: "verification",
  mandatory: false,
  permission: "read_case",
  candidates(s) {
    if (s.fingerprints.length === 0) return [];
    const ids = s.fingerprints.map((f) => f.id).sort();
    return [{ inputHash: hashOf(ids), reason: `${ids.length} photo(s)/screenshot(s) have not been compared.`, inputSummary: `${ids.length} image fingerprint(s)`, input: { fingerprintIds: ids } }];
  },
  async run(ctx, s) {
    const caseFps = s.fingerprints;
    // Other images the user owns (other investigations), plus shared listing images.
    const others = await db
      .select({ fp: imageFingerprint, evidenceId: evidence.id, invId: evidence.investigationId, invTitle: investigation.title, evTitle: evidence.title })
      .from(imageFingerprint)
      .innerJoin(documentVersion, eq(documentVersion.id, imageFingerprint.documentVersionId))
      .innerJoin(document, eq(document.id, documentVersion.documentId))
      .innerJoin(evidence, eq(evidence.documentVersionId, documentVersion.id))
      .innerJoin(investigation, eq(investigation.id, evidence.investigationId))
      .where(and(eq(document.ownerId, ctx.userId), ne(evidence.investigationId, s.inv.id)));
    const listingFps = await db
      .select({ fp: imageFingerprint, listing: rentalListing })
      .from(imageFingerprint)
      .innerJoin(listingImage, eq(listingImage.id, imageFingerprint.listingImageId))
      .innerJoin(rentalListing, eq(rentalListing.id, listingImage.listingId))
      .where(and(isNotNull(imageFingerprint.listingImageId), sql`(${rentalListing.ownerId} is null or ${rentalListing.ownerId} = ${ctx.userId})`));

    const claims = activeClaims(s.snapshot);
    const caseRent = byType(claims, "rent").map(centsOf).find((x) => x !== null) ?? null;
    const caseAddr = byType(claims, "address")[0]?.value ?? null;
    const caseBeds = byType(claims, "bedrooms")[0]?.normalized ?? null;
    const matches: ImageMatchRecord[] = [];
    const seen = new Set<string>();

    for (const cf of caseFps) {
      for (const o of others) {
        const cmp = compareFingerprints(cf, o.fp);
        if (!cmp.kind) continue;
        const key = `${cf.evidenceId}|e:${o.evidenceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({ evidenceId: cf.evidenceId, matchedLabel: `your other investigation “${o.invTitle}” (${o.evTitle})`, matchType: cmp.kind, distance: cmp.distance, matchedEvidenceId: o.evidenceId });
      }
      for (const l of listingFps) {
        const cmp = compareFingerprints(cf, l.fp);
        if (!cmp.kind) continue;
        const key = `${cf.evidenceId}|l:${l.listing.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const conflicts: string[] = [];
        if (caseRent !== null && l.listing.rentCents !== null && caseRent !== l.listing.rentCents) conflicts.push(`rent ${formatCents(l.listing.rentCents)} vs ${formatCents(caseRent)} here`);
        if (caseAddr && l.listing.address && !l.listing.address.toLowerCase().includes(caseAddr.toLowerCase().split(",")[0]!)) conflicts.push(`address “${l.listing.address}” vs “${caseAddr}” here`);
        if (caseBeds !== null && l.listing.bedrooms !== null && String(l.listing.bedrooms) !== caseBeds) conflicts.push(`${l.listing.bedrooms} bedroom(s) vs ${caseBeds} here`);
        matches.push({
          evidenceId: cf.evidenceId,
          matchedLabel: `${l.listing.isDemo ? "DEMO listing" : "listing"} “${l.listing.title}”`,
          matchType: cmp.kind,
          distance: cmp.distance,
          matchedListingId: l.listing.id,
          conflictingDetails: conflicts,
        });
      }
    }
    await upsertCheck(s.inv.id, "image_reuse_local", {
      status: "unverified",
      method: "Local perceptual-hash comparison (dHash/aHash)",
      summary: matches.length
        ? `${matches.length} local image match(es) found. Matches can be legitimate; see details.`
        : `No local match among ${others.length + listingFps.length} image(s) compared. This does not establish that the photos are original.`,
      performedBy: "agent",
      providerMode: "DETERMINISTIC",
      evidenceIds: [...new Set(caseFps.map((f) => f.evidenceId))],
      details: { result: matches.length ? "match" : "no_match", compared: others.length + listingFps.length, matches },
    });
    return { status: "succeeded", mode: "LOCAL", summary: matches.length ? `${matches.length} local match(es).` : "No local matches found.", output: { matches: matches.length, compared: others.length + listingFps.length }, stateChanged: true };
  },
};

export const webImageSearch: AgentTool<{ fingerprintIds: string[] }> = {
  name: "web_image_search",
  label: "Web image search",
  description: "Reverse image search on the public web through a configured, authorized provider (Google Cloud Vision Web Detection).",
  category: "research",
  mandatory: false,
  permission: "external_read",
  candidates(s) {
    if (s.fingerprints.length === 0) return [];
    const ids = s.fingerprints.map((f) => f.id).sort();
    return [{ inputHash: hashOf(["web", ids]), reason: "Photos could be checked for reuse elsewhere on the web.", inputSummary: `${ids.length} image(s)`, input: { fingerprintIds: ids } }];
  },
  async run(ctx, s, input) {
    const provider = new GoogleVisionWebDetection();
    if (provider.info().status !== "LIVE") {
      await upsertCheck(s.inv.id, "image_reuse_web", {
        status: "provider_unavailable",
        method: "Reverse image search",
        summary: "Search not performed: no reverse-image provider is configured.",
        performedBy: "agent",
        providerId: "google_vision_web",
        providerMode: "NOT_CONFIGURED",
        details: { result: "not_performed" },
      });
      return { status: "not_configured", mode: "NONE", summary: "Reverse image search provider not configured.", stateChanged: true };
    }
    const matches: ImageMatchRecord[] = [];
    let errors = 0;
    for (const fp of s.fingerprints.filter((f) => input.fingerprintIds.includes(f.id)).slice(0, 4)) {
      const [dv] = await db.select().from(documentVersion).where(eq(documentVersion.id, fp.documentVersionId!));
      if (!dv) continue;
      const bytes = await storage().get(dv.storageKey);
      const r = await provider.detect(bytes);
      if (!r.ok) {
        errors++;
        continue;
      }
      const pages = r.data.pagesWithMatches;
      if (r.data.fullMatches.length || pages.length) {
        matches.push({ evidenceId: fp.evidenceId, matchedLabel: `${pages.length} web page(s), e.g. ${pages[0]?.url ?? r.data.fullMatches[0]}`, matchType: "web_match", distance: 0 });
      }
    }
    await upsertCheck(s.inv.id, "image_reuse_web", {
      status: errors && !matches.length ? "provider_unavailable" : "unverified",
      method: "Google Cloud Vision Web Detection",
      summary: matches.length ? `${matches.length} photo(s) appear on other web pages.` : errors ? "Provider errors prevented a complete search." : "No external matches found. This does not establish that the listing is genuine.",
      performedBy: "provider",
      providerId: "google_vision_web",
      providerMode: "LIVE",
      details: { result: matches.length ? "match" : "no_match", matches },
    });
    return { status: errors && !matches.length ? "provider_unavailable" : "succeeded", mode: "LIVE", summary: `${matches.length} web match(es).`, output: { matches: matches.length, errors }, stateChanged: true };
  },
};

export const rentalComparison: AgentTool<{ rentCents: number; bedrooms: number | null; city: string }> = {
  name: "rental_comparison",
  label: "Rental comparison",
  description: "Compares the asking rent with comparable listings available to SafeLease (labeled DEMO when using demo inventory). Informational only.",
  category: "research",
  mandatory: false,
  permission: "read_case",
  candidates(s) {
    const c = activeClaims(s.snapshot);
    const rent = byType(c, "rent").map(centsOf).find((x) => x !== null);
    if (!rent) return [];
    const beds = byType(c, "bedrooms").map((x) => Number(x.normalized)).find((x) => Number.isFinite(x)) ?? null;
    const city = byType(c, "city")[0]?.value ?? s.inv.city ?? "Halifax";
    return [{ inputHash: hashOf([rent, beds, city]), reason: "Asking rent can be put in context.", inputSummary: `${formatCents(rent)}, ${beds ?? "?"} bed, ${city}`, input: { rentCents: rent, bedrooms: beds, city } }];
  },
  async run(ctx, s, input) {
    const conds = [isNotNull(rentalListing.rentCents), sql`lower(${rentalListing.city}) = ${input.city.toLowerCase()}`, inArray(rentalListing.sourceKey, ["demo_inventory", "partner_feed"])];
    if (input.bedrooms !== null) conds.push(eq(rentalListing.bedrooms, input.bedrooms));
    const rows = await db.select({ rent: rentalListing.rentCents, isDemo: rentalListing.isDemo }).from(rentalListing).where(and(...conds));
    const rents = rows.map((r) => r.rent!).sort((a, b) => a - b);
    if (rents.length < 3) return { status: "succeeded", mode: "DEMO", summary: `Only ${rents.length} comparable listing(s); no comparison made.`, output: { rentContext: null } };
    const median = rents.length % 2 ? rents[(rents.length - 1) / 2]! : Math.round((rents[rents.length / 2 - 1]! + rents[rents.length / 2]!) / 2);
    const isDemo = rows.every((r) => r.isDemo);
    return {
      status: "succeeded",
      mode: isDemo ? "DEMO" : "LIVE",
      summary: `Median of ${rents.length} ${isDemo ? "DEMO " : ""}comparable listing(s): ${formatCents(median)}.`,
      output: { rentContext: { medianCents: median, count: rents.length, sourceLabel: isDemo ? "SafeLease demo-inventory" : "available", isDemo, bedrooms: input.bedrooms, city: input.city } },
      stateChanged: true,
    };
  },
};

export const listingDiscovery: AgentTool<{ budgetMax: number; bedrooms: number | null; city: string }> = {
  name: "listing_discovery",
  label: "Alternative listing discovery",
  description: "When the current listing has serious concerns, finds alternative candidates from available sources (clearly labeled DEMO when from demo inventory).",
  category: "research",
  mandatory: false,
  permission: "propose_action",
  candidates(s) {
    const serious = s.activeFindings.filter((f) => f.severity === "serious");
    if (serious.length === 0) return [];
    const c = activeClaims(s.snapshot);
    const rent = byType(c, "rent").map(centsOf).find((x) => x !== null);
    const beds = byType(c, "bedrooms").map((x) => Number(x.normalized)).find((x) => Number.isFinite(x)) ?? null;
    const city = byType(c, "city")[0]?.value ?? s.inv.city ?? "Halifax";
    return [{ inputHash: hashOf([rent, beds, city]), reason: "Serious concerns exist; alternatives may help the renter avoid pressure to pay.", inputSummary: `${beds ?? "any"} bed ≤ ${rent ? formatCents(Math.round(rent * 1.15)) : "any"}`, input: { budgetMax: rent ? Math.round((rent * 1.15) / 100) : 5000, bedrooms: beds, city } }];
  },
  async run(ctx, s, input) {
    const r = await new DemoInventoryAdapter(ctx.userId).searchListings({ city: input.city, budgetMax: input.budgetMax, bedroomsMin: input.bedrooms ?? undefined });
    const found = r.ok ? r.data.filter((l) => l.id !== s.inv.listingId).slice(0, 6) : [];
    if (found.length) {
      const params = new URLSearchParams({ city: input.city, budgetMax: String(input.budgetMax), ...(input.bedrooms !== null ? { bedroomsMin: String(input.bedrooms) } : {}), from: s.inv.id });
      await proposeAction(s.inv.id, {
        key: `explore_alternatives:${hashOf(params.toString())}`,
        type: "explore_alternatives",
        title: `Explore ${found.length} alternative candidate${found.length === 1 ? "" : "s"}`,
        description: `${found.length} ${found.every((l) => l.isDemo) ? "DEMO (fictional) " : ""}listing(s) match your size and budget. Open Discover with these filters: /discover?${params.toString()}`,
        runId: ctx.runId,
      });
    }
    return { status: "succeeded", mode: r.ok ? r.mode === "DEMO" ? "DEMO" : "LIVE" : "NONE", summary: `${found.length} alternative candidate(s) found${found.every((l) => l.isDemo) && found.length ? " in DEMO inventory" : ""}.`, output: { listingIds: found.map((l) => l.id) } };
  },
};
