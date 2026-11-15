/** Runs due monitoring jobs once (local scheduler substitute). Usage: npm run jobs:run */
export {};
async function main() {
  const { runDueJobs } = await import("../src/server/services/jobs");
  const res = await runDueJobs("manual_runner");
  if (res.length === 0) console.log("[jobs] no jobs due");
  for (const r of res) console.log(`[jobs] ${r.type} → ${r.status}: ${r.message}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
