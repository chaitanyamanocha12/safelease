import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/geo";
import { dedupeListings, rankListings, DEFAULT_WEIGHTS, type NormalizedListing } from "@/lib/discover";
import { formatCents, parseMoneyToCents } from "@/lib/money";
import { redactMetadata, redactText } from "@/server/security/redact";
import { isPrivateAddress, parsePublicUrl, automatedFetchRestricted, htmlToText } from "@/server/security/url-safety";
import { sniff, sanitizeFileName } from "@/server/security/upload";
import { csvEscape } from "@/server/reports/builders";
import { pdfSafe } from "@/server/reports/pdf";
import { compareInspections } from "@/server/services/tenancy";
import { analyzeMaintenance } from "@/server/services/tenancy";
import { analyzeLease, diffTerms } from "@/server/leases/analyze";
import { CASE_C_LEASE, LEASE_V1_TEXT, LEASE_V2_TEXT } from "@/server/seed/demo-texts";
import { suppress } from "@/server/services/organizations";

const L = (over: Partial<NormalizedListing>): NormalizedListing => ({ id: "x", sourceKey: "demo_inventory", sourceName: "demo", sourceKind: "demo_inventory", isDemo: true, sourceUrl: null, title: "t", description: null, address: null, neighbourhood: null, city: "Halifax", lat: 44.64, lng: -63.58, coordinatesSource: "fictional_demo", rentCents: 150000, depositCents: null, upfrontFeesCents: null, bedrooms: 2, bathrooms: 1, propertyType: "apartment", furnished: false, parking: null, petsAllowed: null, utilitiesIncluded: [], accessibilityFeatures: [], features: [], leaseType: null, availableFrom: null, publishedAt: null, retrievedAt: new Date().toISOString(), availabilityStatus: "unverified", dataConfidence: "demo", imageUrls: [], distanceKm: null, ...over });

describe("geography", () => {
  it("computes straight-line distance", () => {
    expect(haversineKm({ lat: 44.6366, lng: -63.5917 }, { lat: 44.6663, lng: -63.5676 })).toBeCloseTo(3.8, 0);
    expect(haversineKm({ lat: 44.6, lng: -63.5 }, { lat: 44.6, lng: -63.5 })).toBe(0);
  });
});

describe("ranking", () => {
  it("is explainable and respects weights", () => {
    const cheap = L({ id: "a", rentCents: 120000 });
    const big = L({ id: "b", rentCents: 200000, bedrooms: 3, bathrooms: 2 });
    const byPrice = rankListings([{ listing: cheap, evidenceScore: null, seriousFindings: 0 }, { listing: big, evidenceScore: null, seriousFindings: 0 }], { ...DEFAULT_WEIGHTS, space: 0, price: 5 });
    expect(byPrice[0]!.listing.id).toBe("a");
    expect(byPrice[0]!.reasons.join()).toMatch(/Lower rent/);
    const bySpace = rankListings([{ listing: cheap, evidenceScore: null, seriousFindings: 0 }, { listing: big, evidenceScore: null, seriousFindings: 0 }], { ...DEFAULT_WEIGHTS, price: 0, space: 5 });
    expect(bySpace[0]!.listing.id).toBe("b");
  });
  it("penalizes serious findings through evidence, not price", () => {
    const r = rankListings([{ listing: L({ id: "a" }), evidenceScore: 0.6, seriousFindings: 2 }, { listing: L({ id: "b" }), evidenceScore: 0.6, seriousFindings: 0 }], { price: 0, distance: 0, space: 0, amenities: 0, evidence: 5 });
    expect(r[0]!.listing.id).toBe("b");
  });
  it("deduplicates the same unit from multiple sources, preferring live data", () => {
    const d = dedupeListings([L({ id: "demo", address: "12 Example St", isDemo: true }), L({ id: "live", address: "12 Example Street", isDemo: false })]);
    expect(d).toHaveLength(1);
    expect(d[0]!.id).toBe("live");
  });
});

describe("money", () => {
  it("parses and formats", () => {
    expect(parseMoneyToCents("$1,600.50")).toBe(160050);
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(formatCents(160000)).toBe("$1,600");
  });
});

describe("security helpers", () => {
  it("redacts contact details and sensitive metadata", () => {
    expect(redactText("Email anna@x.com or call 902-555-0142")).toBe("Email [email] or call [phone]");
    expect(redactMetadata({ body: "secret message", count: 3 })).toEqual({ body: "[redacted:14 chars]", count: 3 });
  });
  it("blocks private and metadata addresses (SSRF)", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "169.254.169.254", "192.168.1.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(() => parsePublicUrl("http://localhost:3000/")).toThrow();
    expect(() => parsePublicUrl("file:///etc/passwd")).toThrow();
    expect(() => parsePublicUrl("https://user:pw@example.com")).toThrow();
    expect(() => parsePublicUrl("https://example.com:8080/")).toThrow();
    expect(automatedFetchRestricted(new URL("https://www.facebook.com/marketplace/item/1"))).toMatch(/does not automatically fetch/);
  });
  it("strips scripts when converting HTML", () => {
    expect(htmlToText("<p>Rent $1,500</p>").text).toBe("Rent $1,500");
    expect(htmlToText("<script>evil()</script><p>ok</p>").text).not.toContain("evil");
  });
  it("sniffs content by magic bytes, not names", () => {
    expect(sniff(Buffer.from("%PDF-1.7 ..."))).toBe("pdf");
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(sniff(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x00]))).toBeNull();
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
  });
  it("guards CSV formula injection", () => {
    expect(csvEscape("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
  });
  it("produces PDF-safe text", () => {
    expect(pdfSafe("a → b ✓ 😀")).toBe("a -> b v ");
  });
});

describe("tenancy helpers", () => {
  const item = (over: Record<string, unknown>) => ({ id: "i", inspectionId: "x", room: "kitchen", roomLabel: null, itemName: "Oven", condition: "good", description: null, preExisting: false, repairPromised: false, repairDueDate: null, createdAt: new Date(), updatedAt: new Date(), ...over }) as never;
  it("compares move-in and move-out", () => {
    const r = compareInspections([item({}), item({ itemName: "Walls", room: "living_room", condition: "fair", preExisting: true })], [item({ condition: "damaged" }), item({ itemName: "Walls", room: "living_room", condition: "fair" })]);
    expect(r.find((x) => x.itemName === "Oven")?.change).toBe("worse");
    expect(r.find((x) => x.itemName === "Walls")?.change).toBe("unchanged");
  });
  it("flags conflicting promises and overdue repairs without assuming completion", () => {
    const c = { id: "m", status: "landlord_reports_complete", severity: "medium", location: "Bathroom", promisedBy: "2026-09-30" } as never;
    const ev = (t: string, d: string, p?: string) => ({ id: d + t, caseId: "m", eventType: t, occurredOn: d, description: t, promisedDate: p ?? null, documentId: null, createdAt: new Date() }) as never;
    const a = analyzeMaintenance(c, [ev("reported", "2026-09-02"), ev("repair_promised", "2026-09-03", "2026-09-15"), ev("repair_promised", "2026-09-20", "2026-09-30"), ev("landlord_reports_complete", "2026-10-01")], "2026-10-05");
    expect(a.conflicts[0]).toMatch(/Different repair dates/);
    expect(a.flags.some((f) => /doesn't confirm completion/.test(f.text))).toBe(true);
  });
});

describe("lease analysis", () => {
  it("classifies clauses and reports missing terms without inferring", () => {
    const a = analyzeLease(CASE_C_LEASE, null);
    expect(a.counts.clear_rule_violation).toBeGreaterThanOrEqual(1);
    expect(a.clauses.some((c) => c.classification === "potential_issue" && /non-refundable/i.test(c.explanation ?? ""))).toBe(true);
    expect(analyzeLease("This lease is between the parties.", null).missingTerms).toContain("Monthly rent amount");
  });
  it("compares lease with listing and diffs revisions", () => {
    const v1 = analyzeLease(LEASE_V1_TEXT.replace("\f", "\n"), null, { rentCents: 160000, utilitiesIncluded: ["heat", "hot water"] });
    expect(v1.comparison.find((c) => c.field === "Monthly rent")?.match).toBe(false);
    const v2 = analyzeLease(LEASE_V2_TEXT, null);
    expect(diffTerms(v1.terms, v2.terms).map((d) => d.field)).toContain("Monthly rent");
  });
});

describe("aggregate disclosure control", () => {
  it("suppresses small counts", () => {
    expect(suppress(3, 5)).toBe("<5");
    expect(suppress(5, 5)).toBe(5);
  });
});

describe("DNS-rebinding guard", () => {
  it("refuses to connect to hosts resolving to private addresses", async () => {
    const { guardedLookup } = await import("@/server/security/url-safety");
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => guardedLookup("localhost", {}, (e) => resolve(e)));
    expect(err?.code).toBe("EBLOCKED");
  });
});

