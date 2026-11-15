/**
 * Repeatable agent evaluation on the labeled fixture dataset, using the real
 * services and orchestrator against a throwaway database.
 * Usage: npm run eval:agent   (writes eval-results.json)
 * Results describe THIS dataset only; they are not real-world accuracy.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelease-eval-"));
process.env.DATABASE_URL = `file:${path.join(dir, "eval.db")}`;
process.env.STORAGE_LOCAL_DIR = path.join(dir, "storage");
process.env.LLM_PROVIDER = process.env.EVAL_USE_LLM ? process.env.LLM_PROVIDER ?? "anthropic" : "none";
process.env.GEOCODER_PROVIDER = "none";
process.env.WEB_SEARCH_PROVIDER = "none";

async function main() {
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const { db } = await import("../src/server/db/client");
  await migrate(db, { migrationsFolder: "./drizzle" });
  const S = await import("../src/server/db/schema");
  const { seedReference } = await import("../src/server/seed/reference");
  await seedReference(db);
  const inv = await import("../src/server/services/investigations");
  const { runAgentNow } = await import("../src/server/agent/orchestrator");
  const { and, eq } = await import("drizzle-orm");
  const { EVAL_CASES } = await import("../tests/fixtures/eval-dataset");
  const uid = "usr_eval";
  await db.insert(S.user).values({ id: uid, name: "Eval", email: "eval@example.test" });
  const other = "usr_eval_other";
  await db.insert(S.user).values({ id: other, name: "Other", email: "other@example.test" });

  let tp = 0, fn = 0, fp = 0, tn = 0, legalOk = 0, legalTotal = 0;
  const durations: number[] = [];
  const toolStatus: Record<string, number> = {};
  const rows: unknown[] = [];
  for (const c of EVAL_CASES) {
    const id = await inv.createInvestigation(uid, { title: c.name });
    let prev: string | null = null;
    const t0 = performance.now();
    for (const d of c.docs) prev = await inv.addEvidence(uid, id, { kind: d.kind, title: d.kind, text: d.text, supersedesEvidenceId: d.supersedesPrev ? prev : null });
    const runId = await runAgentNow(uid, id, { trigger: "manual" });
    durations.push(performance.now() - t0);
    for (const t of await db.select().from(S.toolRun).where(eq(S.toolRun.agentRunId, runId))) toolStatus[t.status] = (toolStatus[t.status] ?? 0) + 1;
    const keys = (await db.select().from(S.finding).where(and(eq(S.finding.investigationId, id), eq(S.finding.lifecycle, "active")))).map((f) => f.findingKey);
    const missed = c.expect.filter((k) => !keys.includes(k));
    const falsePos = c.forbid.filter((k) => keys.includes(k));
    tp += c.expect.length - missed.length;
    fn += missed.length;
    fp += falsePos.length;
    tn += c.forbid.length - falsePos.length;
    for (const k of [...c.expect, ...c.forbid].filter((x) => x.startsWith("legal:"))) {
      legalTotal++;
      if (c.expect.includes(k) === keys.includes(k)) legalOk++;
    }
    rows.push({ case: c.name, missed, falsePositives: falsePos, ms: Math.round(durations.at(-1)!) });
  }
  // Unauthorized access attempts
  let blocked = 0;
  const all = await db.select({ id: S.investigation.id }).from(S.investigation);
  for (const r of all) {
    try {
      await inv.getInvestigationForUser(other, r.id);
    } catch {
      blocked++;
    }
  }
  const totalTools = Object.values(toolStatus).reduce((a, b) => a + b, 0);
  const summary = {
    disclaimer: "Measured on SafeLease's fictional evaluation fixtures only. Not real-world fraud-detection accuracy.",
    cases: EVAL_CASES.length,
    expectedFindingsDetected: tp,
    expectedFindingsMissed: fn,
    falsePositives: fp,
    correctlyAbsent: tn,
    legalRuleCheckAccuracy: legalTotal ? `${legalOk}/${legalTotal}` : "n/a",
    toolRuns: toolStatus,
    toolSuccessRate: `${(((toolStatus.succeeded ?? 0) / totalTools) * 100).toFixed(1)}% (unconfigured providers counted separately: ${toolStatus.not_configured ?? 0})`,
    providerUnavailableHandled: (toolStatus.not_configured ?? 0) + (toolStatus.provider_unavailable ?? 0),
    averageInvestigationMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    unauthorizedAccessAttemptsBlocked: `${blocked}/${all.length}`,
    plannerMode: process.env.LLM_PROVIDER === "none" ? "deterministic" : "llm",
    perCase: rows,
  };
  fs.writeFileSync("eval-results.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, perCase: undefined }, null, 2));
  for (const r of rows as Array<{ case: string; missed: string[]; falsePositives: string[] }>) if (r.missed.length || r.falsePositives.length) console.log("ISSUE", r);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
