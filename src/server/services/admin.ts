/** Platform administration. Every function requires a platform_admin caller. */
import { and, desc, eq, gte, like, sql } from "drizzle-orm";
import { db } from "../db/client";
import { agentRun, auditEvent, featureFlag, investigation, jobRun, legalRule, legalRuleVersion, legalSource, llmUsage, monitoringJob, organization, toolRun, user } from "../db/schema";
import { newId } from "@/lib/ids";
import { AppError, notFound } from "../errors";
import { assertPlatformAdmin, type SessionUser } from "../auth/session";
import { audit } from "./audit";

export async function overview(admin: SessionUser) {
  assertPlatformAdmin(admin);
  const since = new Date(Date.now() - 30 * 86400000);
  const n = async (q: Promise<Array<{ n: number }>>) => Number((await q)[0]?.n ?? 0);
  const [users, cases, runs, orgs] = await Promise.all([
    n(db.select({ n: sql<number>`count(*)` }).from(user)),
    n(db.select({ n: sql<number>`count(*)` }).from(investigation)),
    n(db.select({ n: sql<number>`count(*)` }).from(agentRun).where(gte(agentRun.startedAt, since))),
    db.select().from(organization).orderBy(organization.name),
  ]);
  const toolStats = await db.select({ status: toolRun.status, n: sql<number>`count(*)` }).from(toolRun).where(gte(toolRun.startedAt, since)).groupBy(toolRun.status);
  const usage = await db.select({ model: llmUsage.model, calls: sql<number>`count(*)`, input: sql<number>`sum(${llmUsage.inputTokens})`, output: sql<number>`sum(${llmUsage.outputTokens})`, cost: sql<number>`sum(${llmUsage.estimatedCostUsd})`, failed: sql<number>`sum(case when ${llmUsage.succeeded} then 0 else 1 end)` }).from(llmUsage).where(gte(llmUsage.createdAt, since)).groupBy(llmUsage.model);
  const errors = await db.select({ tool: toolRun.tool, error: toolRun.error, at: toolRun.startedAt }).from(toolRun).where(eq(toolRun.status, "failed")).orderBy(desc(toolRun.startedAt)).limit(10);
  const failedRuns = await db.select({ id: agentRun.id, error: agentRun.error, at: agentRun.startedAt }).from(agentRun).where(eq(agentRun.status, "failed")).orderBy(desc(agentRun.startedAt)).limit(10);
  const flags = await db.select().from(featureFlag);
  return { users, cases, runs, orgs, toolStats, usage, errors, failedRuns, flags };
}

export async function setFlag(admin: SessionUser, key: string, enabled: boolean) {
  assertPlatformAdmin(admin);
  await db.update(featureFlag).set({ enabled, updatedBy: admin.id, updatedAt: new Date() }).where(eq(featureFlag.key, key));
  await audit({ actorId: admin.id, action: "admin.flag", resourceType: "feature_flag", resourceId: key, metadata: { enabled } });
}

export async function listRules(admin: SessionUser) {
  assertPlatformAdmin(admin);
  const rules = await db.select().from(legalRule).orderBy(legalRule.ruleKey);
  const versions = await db.select().from(legalRuleVersion).orderBy(desc(legalRuleVersion.version));
  return rules.map((r) => ({ rule: r, versions: versions.filter((v) => v.ruleId === r.id) }));
}

/** Proposed edits never take effect until approved by an administrator. */
export async function proposeRuleVersion(admin: SessionUser, ruleKey: string, patch: { summary: string; params: Record<string, number | string | boolean>; changeNote: string; citation?: string }) {
  assertPlatformAdmin(admin);
  const [r] = await db.select().from(legalRule).where(eq(legalRule.ruleKey, ruleKey));
  if (!r) throw notFound("Rule");
  const versions = await db.select().from(legalRuleVersion).where(eq(legalRuleVersion.ruleId, r.id)).orderBy(desc(legalRuleVersion.version));
  const base = versions.find((v) => v.version === r.effectiveVersion)!;
  if (versions.some((v) => v.reviewStatus === "pending_review")) throw new AppError("CONFLICT", "A version is already pending review.");
  const id = newId("rv");
  await db.insert(legalRuleVersion).values({ ...base, id, version: versions[0]!.version + 1, summary: patch.summary, params: patch.params, citation: patch.citation ?? base.citation, changeNote: patch.changeNote, reviewStatus: "pending_review", createdBy: admin.id, reviewedBy: null, reviewedAt: null, createdAt: new Date() });
  await audit({ actorId: admin.id, action: "rule.propose", resourceType: "legal_rule", resourceId: ruleKey });
  return id;
}

export async function reviewRuleVersion(admin: SessionUser, versionId: string, decision: "approve" | "reject") {
  assertPlatformAdmin(admin);
  const [v] = await db.select().from(legalRuleVersion).where(eq(legalRuleVersion.id, versionId));
  if (!v || v.reviewStatus !== "pending_review") throw new AppError("CONFLICT", "Version is not pending review.");
  if (v.createdBy === admin.id && process.env.ALLOW_SELF_REVIEW !== "true") throw new AppError("FORBIDDEN", "A different administrator must review this change (set ALLOW_SELF_REVIEW=true for single-admin development).");
  if (decision === "approve") {
    await db.update(legalRuleVersion).set({ reviewStatus: "superseded" }).where(and(eq(legalRuleVersion.ruleId, v.ruleId), eq(legalRuleVersion.reviewStatus, "verified")));
    await db.update(legalRuleVersion).set({ reviewStatus: "verified", reviewedBy: admin.id, reviewedAt: new Date(), verifiedOn: new Date().toISOString().slice(0, 10) }).where(eq(legalRuleVersion.id, versionId));
    await db.update(legalRule).set({ effectiveVersion: v.version }).where(eq(legalRule.id, v.ruleId));
  } else {
    await db.update(legalRuleVersion).set({ reviewStatus: "rejected", reviewedBy: admin.id, reviewedAt: new Date() }).where(eq(legalRuleVersion.id, versionId));
  }
  await audit({ actorId: admin.id, action: `rule.${decision}`, resourceType: "legal_rule_version", resourceId: versionId });
}

export async function listSources(admin: SessionUser) {
  assertPlatformAdmin(admin);
  return db.select().from(legalSource).orderBy(legalSource.sourceKey);
}

export async function markSourceVerified(admin: SessionUser, id: string, note: string) {
  assertPlatformAdmin(admin);
  await db.update(legalSource).set({ status: "verified", verifiedOn: new Date().toISOString().slice(0, 10), verificationNote: note.slice(0, 500) }).where(eq(legalSource.id, id));
  await audit({ actorId: admin.id, action: "source.verify", resourceType: "legal_source", resourceId: id });
}

export async function jobsStatus(admin: SessionUser) {
  assertPlatformAdmin(admin);
  const jobs = await db.select().from(monitoringJob).orderBy(monitoringJob.nextRunAt).limit(100);
  const runs = await db.select().from(jobRun).orderBy(desc(jobRun.startedAt)).limit(20);
  return { jobs, runs };
}

export async function auditLog(admin: SessionUser, opts: { action?: string; outcome?: string; page?: number }) {
  assertPlatformAdmin(admin);
  const conds = [];
  if (opts.action) conds.push(like(auditEvent.action, `${opts.action.replace(/[%_]/g, "")}%`));
  if (opts.outcome === "denied" || opts.outcome === "error" || opts.outcome === "success") conds.push(eq(auditEvent.outcome, opts.outcome));
  const page = Math.max(1, opts.page ?? 1);
  const rows = await db
    .select({ e: auditEvent, actor: user.email })
    .from(auditEvent)
    .leftJoin(user, eq(user.id, auditEvent.actorId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditEvent.createdAt))
    .limit(50)
    .offset((page - 1) * 50);
  return { rows, page };
}
