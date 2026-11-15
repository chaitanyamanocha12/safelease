import { migrateTestDb } from "../helpers/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

let server: http.Server;
beforeAll(async () => {
  await migrateTestDb();
  server = http.createServer((req, res) => {
    if (req.headers.authorization !== "Bearer feed-key") { res.writeHead(401).end(); return; }
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ listings: [
      { id: "p1", title: "Partner 2BR", city: "Halifax", rent: 1725, bedrooms: 2, bathrooms: 1, lat: 44.65, lng: -63.58, url: "https://partner.example/p1" },
      { id: "bad", title: "", city: "Halifax" },
    ] }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.RENTAL_FEED_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/feed`;
  process.env.RENTAL_FEED_API_KEY = "feed-key";
  process.env.RENTAL_FEED_NAME = "Test Partner";
  (await import("@/server/env")).resetEnvCache();
});
afterAll(() => server.close());

describe("licensed partner feed adapter (local mock server)", () => {
  it("normalizes valid items, skips invalid ones and labels results LIVE (not demo)", async () => {
    const { PartnerFeedAdapter } = await import("@/server/providers/listings");
    const r = await new PartnerFeedAdapter().searchListings({ city: "Halifax" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mode).toBe("LIVE");
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ title: "Partner 2BR", rentCents: 172500, isDemo: false, sourceName: "Test Partner", sourceUrl: "https://partner.example/p1" });
  });
  it("reports UNAVAILABLE (never demo data) when the feed fails", async () => {
    process.env.RENTAL_FEED_API_KEY = "wrong";
    (await import("@/server/env")).resetEnvCache();
    const { PartnerFeedAdapter } = await import("@/server/providers/listings");
    const r = await new PartnerFeedAdapter().searchListings({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe("UNAVAILABLE");
  });
});
