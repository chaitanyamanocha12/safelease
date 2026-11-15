import { migrateTestDb } from "../helpers/db";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await migrateTestDb();
});

describe("shared (database-backed) rate limiter", () => {
  it("is enforced per key across calls", async () => {
    const { rateLimit } = await import("@/server/security/rate-limit");
    await rateLimit("t:1", 2, 60_000);
    await rateLimit("t:1", 2, 60_000);
    await expect(rateLimit("t:1", 2, 60_000)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(rateLimit("t:2", 2, 60_000)).resolves.toBeUndefined();
  });
  it("resets after the window", async () => {
    const { rateLimit } = await import("@/server/security/rate-limit");
    await rateLimit("t:3", 1, 1);
    await new Promise((r) => setTimeout(r, 5));
    await expect(rateLimit("t:3", 1, 1)).resolves.toBeUndefined();
  });
});
