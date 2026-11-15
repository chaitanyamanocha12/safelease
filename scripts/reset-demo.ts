/** Deletes all demo-flagged data and re-seeds it. Refuses unless DEMO_MODE=true. */
process.env.LLM_PROVIDER = "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.WEB_SEARCH_PROVIDER = "none";
process.env.IMAGE_MATCH_PROVIDER = "none";

async function main() {
  if (!["1", "true", "yes"].includes((process.env.DEMO_MODE ?? "").toLowerCase())) {
    console.error("[reset-demo] refused: DEMO_MODE is not enabled.");
    process.exit(1);
  }
  const { db } = await import("../src/server/db/client");
  const { clearDemo, seedDemo } = await import("../src/server/seed/demo");
  const { seedReference } = await import("../src/server/seed/reference");
  await clearDemo(db);
  await seedReference(db);
  await seedDemo(db, (s) => console.log(`[reset-demo] ${s}`));
  console.log("[reset-demo] done");
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
export {};
