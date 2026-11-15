/**
 * Seeds reference data (legal rules/sources, listing sources, flags) and —
 * when DEMO_MODE=true or --demo is passed — the fictional demo environment.
 * The deterministic engine is used for seeding (no LLM calls, no cost).
 */
process.env.LLM_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = process.env.SEED_USE_PROVIDERS ? process.env.GEOCODER_PROVIDER : "none";
process.env.WEB_SEARCH_PROVIDER = process.env.SEED_USE_PROVIDERS ? process.env.WEB_SEARCH_PROVIDER : "none";
process.env.IMAGE_MATCH_PROVIDER = process.env.SEED_USE_PROVIDERS ? process.env.IMAGE_MATCH_PROVIDER : "none";
process.env.OCR_PROVIDER = process.env.OCR_PROVIDER === "none" ? "none" : "local";

async function main() {
  const { db } = await import("../src/server/db/client");
  const { user } = await import("../src/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const { seedReference } = await import("../src/server/seed/reference");
  await seedReference(db);
  console.log("[seed] reference data ready (legal sources & versioned rules, listing sources, flags)");
  const wantDemo = process.argv.includes("--demo") || ["1", "true", "yes"].includes((process.env.DEMO_MODE ?? "").toLowerCase());
  if (!wantDemo) {
    console.log("[seed] DEMO_MODE is off — skipping demo data.");
    return;
  }
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.isDemo, true)).limit(1);
  if (existing.length && !process.argv.includes("--force")) {
    console.log("[seed] demo data already present (use npm run db:reset-demo to rebuild).");
    return;
  }
  const { seedDemo } = await import("../src/server/seed/demo");
  const t0 = Date.now();
  await seedDemo(db, (s) => console.log(`[seed] ${s}`));
  console.log(`[seed] demo environment ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
export {};
