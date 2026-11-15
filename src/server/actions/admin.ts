"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "./helpers";
import { assertPlatformAdmin } from "../auth/session";
import * as A from "../services/admin";
import { runHealthChecks } from "../providers/registry";
import { runDueJobs } from "../services/jobs";
import { demoModeEnabled } from "../env";
import { AppError } from "../errors";
import { audit } from "../services/audit";

export const setFlagAction = action(z.object({ key: z.string(), enabled: z.boolean() }), async (u, v) => {
  await A.setFlag(u, v.key, v.enabled);
  revalidatePath("/admin");
  return null;
});
export const healthCheckAction = action(z.object({}), async (u) => {
  assertPlatformAdmin(u);
  const r = await runHealthChecks();
  await audit({ actorId: u.id, action: "admin.health_check", resourceType: "providers" });
  revalidatePath("/admin/providers");
  return r.map((x) => ({ id: x.id, name: x.name, status: x.health.status, message: x.health.message, latencyMs: x.health.latencyMs ?? null }));
}, { rateLimit: { key: "health", max: 6, windowMs: 60_000 } });
export const runJobsAction = action(z.object({ jobId: z.string().optional() }), async (u, v) => {
  assertPlatformAdmin(u);
  const r = await runDueJobs("admin", { jobId: v.jobId });
  revalidatePath("/admin/health");
  return r;
});
export const proposeRuleAction = action(z.object({ ruleKey: z.string(), summary: z.string().min(10).max(2000), params: z.string().max(2000), changeNote: z.string().min(5).max(500) }), async (u, v) => {
  let params: Record<string, number | string | boolean>;
  try {
    params = JSON.parse(v.params || "{}");
  } catch {
    throw new AppError("VALIDATION", "Parameters must be valid JSON.");
  }
  await A.proposeRuleVersion(u, v.ruleKey, { summary: v.summary, params, changeNote: v.changeNote });
  revalidatePath("/admin/rules");
  return null;
});
export const reviewRuleAction = action(z.object({ versionId: z.string(), decision: z.enum(["approve", "reject"]) }), async (u, v) => {
  await A.reviewRuleVersion(u, v.versionId, v.decision);
  revalidatePath("/admin/rules");
  return null;
});
export const verifySourceAction = action(z.object({ id: z.string(), note: z.string().min(3).max(500) }), async (u, v) => {
  await A.markSourceVerified(u, v.id, v.note);
  revalidatePath("/admin/sources");
  return null;
});
export const resetDemoAction = action(z.object({ confirm: z.literal(true) }), async (u) => {
  assertPlatformAdmin(u);
  if (!demoModeEnabled()) throw new AppError("FORBIDDEN", "Demo reset is only available when DEMO_MODE=true.");
  await audit({ actorId: null, action: "admin.demo_reset", resourceType: "demo", metadata: { by: u.email } });
  const { db } = await import("../db/client");
  const { clearDemo, seedDemo } = await import("../seed/demo");
  const { seedReference } = await import("../seed/reference");
  await clearDemo(db);
  await seedReference(db);
  await seedDemo(db, () => undefined);
  return null;
});
