import { describe, expect, it } from "vitest";
import { extractClaims } from "@/server/extraction/extract-claims";
import { normalizeAddress, namesCompatible, normalizePhone } from "@/server/extraction/normalize";
import { LISTING_SCREENSHOT_TEXT, MESSAGE_TEXT, LEASE_V1_TEXT, INJECTION_LISTING } from "@/server/seed/demo-texts";

const get = (text: string, kind: "listing" | "message" | "lease", type: string) => extractClaims(text, { sourceKind: kind }).filter((c) => c.claimType === type);

describe("rental field extraction", () => {
  it("extracts core listing terms with locators and excerpts", () => {
    const c = extractClaims(LISTING_SCREENSHOT_TEXT, { sourceKind: "listing" });
    const by = (t: string) => c.find((x) => x.claimType === t);
    expect(by("rent")?.normalized).toBe("160000");
    expect(by("address")?.normalized).toBe("5521 harbourview lane unit 3");
    expect(by("bedrooms")?.normalized).toBe("2");
    expect(by("postal_code")?.normalized).toBe("B3H1Z9");
    expect(by("contact_name")?.value).toBe("Daniel Moreau");
    expect(by("contact_phone")?.normalized).toBe("9025550142");
    expect(by("rent")?.locator).toBe("line 3");
    expect(by("rent")?.excerpt).toContain("$1,600/month");
  });

  it("extracts payment pressure, recipient, method and sensitive requests from a message", () => {
    expect(get(MESSAGE_TEXT, "message", "deposit")[0]?.normalized).toBe("120000");
    expect(get(MESSAGE_TEXT, "message", "requested_payment")).toHaveLength(1);
    expect(get(MESSAGE_TEXT, "message", "payment_recipient")[0]?.value).toBe("Sarah Whitfield");
    expect(get(MESSAGE_TEXT, "message", "payment_method")[0]?.normalized).toBe("etransfer");
    expect(get(MESSAGE_TEXT, "message", "urgency").length).toBeGreaterThan(0);
    expect(get(MESSAGE_TEXT, "message", "viewing_availability")[0]?.normalized).toBe("refused_or_unavailable");
    expect(get(MESSAGE_TEXT, "message", "sensitive_info_request").map((c) => c.normalized).sort()).toEqual(["passport", "sin"]);
  });

  it("does not assign meaning to amounts without context", () => {
    const c = extractClaims("The building was built in 1985 and has 2400 square feet.", { sourceKind: "listing" });
    expect(c.filter((x) => ["rent", "deposit", "application_fee"].includes(x.claimType))).toHaveLength(0);
  });

  it("does not treat 'available today' as payment pressure", () => {
    expect(get("Unit available today. Laundry in building.", "listing", "urgency")).toHaveLength(0);
  });

  it("detects application fees with and without amounts", () => {
    expect(get("There is a $50 application fee to apply.", "listing", "application_fee")[0]?.normalized).toBe("5000");
    expect(get("A non-refundable application fee applies.", "listing", "application_fee")[0]?.normalized).toBe("mentioned");
  });

  it("extracts lease terms with page references", () => {
    const pages = LEASE_V1_TEXT.split("\f");
    const text = pages.join("\n\n");
    const c = extractClaims(text, { sourceKind: "lease", pageTexts: pages });
    expect(c.find((x) => x.claimType === "rent")?.normalized).toBe("185000");
    expect(c.find((x) => x.claimType === "entry_notice")?.locator).toMatch(/^page 2/);
    expect(c.find((x) => x.claimType === "utilities" && x.normalized.startsWith("tenant_pays"))?.normalized).toBe("tenant_pays:electricity,heat");
  });

  it("flags embedded instructions as data", () => {
    expect(get(INJECTION_LISTING, "listing", "embedded_instruction").length).toBeGreaterThan(0);
  });
});

describe("normalization", () => {
  it("normalizes street suffixes and units", () => {
    expect(normalizeAddress("5521 Harbourview Ln., Unit 3")).toBe("5521 harbourview lane unit 3");
    expect(normalizeAddress("3-5521 Harbourview Lane")).toBe("5521 harbourview lane unit 3");
  });
  it("matches partial names", () => {
    expect(namesCompatible("Daniel", "Daniel Moreau")).toBe(true);
    expect(namesCompatible("Sarah Whitfield", "Daniel Moreau")).toBe(false);
  });
  it("normalizes phone numbers", () => {
    expect(normalizePhone("+1 (902) 555-0142")).toBe("9025550142");
  });
});

describe("amount labels after the number", () => {
  it("classifies '$200 holding fee' even after a deposit mention", () => {
    const c = extractClaims("The security deposit is $700 plus a $200 holding fee to reserve the unit.", { sourceKind: "message" });
    expect(c.find((x) => x.claimType === "deposit")?.normalized).toBe("70000");
    expect(c.find((x) => x.claimType === "holding_fee")?.normalized).toBe("20000");
  });
});
