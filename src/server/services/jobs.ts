/**
 * Monitoring jobs. Jobs only run when something calls runDueJobs:
 * `npm run jobs:run`, the admin "Run due jobs" button, or an external cron
 * hitting /api/cron with CRON_SECRET. Nothing runs in the background otherwise.
 */
import { and, eq, inArray, isNotNull, lte, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { depositRecord, finding, investigation, jobRun, legalSource, maintenanceCase, monitoringJob, savedSearch, user, userProfile } from "../db/schema";
import { newId } from "@/lib/ids";
import { depositReturnDeadline } from "../legal/rules";
import { notify } from "./notifications";
import { searchRentals } from "./discovery";
import { createAgentRun, executeAgentRun, sweepStaleRuns } from "../agent/orchestrator";
import { discoverFiltersSchema } from "@/lib/discover";

type Trigger = "manual_runner" | "admin" | "cron_endpoint" | "user";
type Job = typeof monitoringJob.$inferSelect;

async function runOne(job: Job): Promise<{ status: "succeeded" | "failed" | "skipped"; message: string }> {
  const today = new Date().toISOString().slice(0, 10);
  switch (job.jobType) {
    case "investigation_recheck": {
      if (!job.targetId || !job.ownerId) return { status: "skipped", message: "No target." };
      const [inv] = await db.select().from(investigation).where(eq(investigation.id, job.targetId));
      if (!inv || inv.status === "closed") return { status: "skipped", message: "Case closed or missing." };
      const before = (await db.select({ k: finding.findingKey }).from(finding).where(and(eq(finding.investigationId, inv.id), eq(finding.lifecycle, "active")))).map((f) => f.k);
      const { runId, reused } = await createAgentRun(job.ownerId, inv.id, { trigger: "scheduled" });
      if (!reused) await executeAgentRun(runId);
      const after = (await db.select({ k: finding.findingKey }).from(finding).where(and(eq(finding.investigationId, inv.id), eq(finding.lifecycle, "active")))).map((f) => f.k);
      const added = after.filter((k) => !before.includes(k)).length;
      const removed = before.filter((k) => !after.includes(k)).length;
      if (added || removed) await notify(job.ownerId, { category: "case", title: "Scheduled re-check found changes", body: `“${inv.title}”: ${added} new, ${removed} resolved finding(s).`, link: `/investigations/${inv.id}`, dedupeKey: `recheck:${inv.id}:${today}` });
      return { status: "succeeded", message: `Re-checked: ${added} new, ${removed} resolved.` };
    }
    case "saved_search_refresh": {
      const searches = await db.select().from(savedSearch).where(eq(savedSearch.alertsEnabled, true));
      let notified = 0;
      for (const s of searches) {
        const f = discoverFiltersSchema.safeParse(s.filters);
        const res = await searchRentals(s.userId, f.success ? f.data : {}, { record: false });
        if (s.lastResultCount !== null && res.total > s.lastResultCount) {
          if (await notify(s.userId, { category: "listing", title: `New matches for “${s.name}”`, body: `${res.total - s.lastResultCount} new result(s). Availability is unverified.`, link: "/saved", dedupeKey: `ss:${s.id}:${res.total}` })) notified++;
        }
        await db.update(savedSearch).set({ lastRunAt: new Date(), lastResultCount: res.total }).where(eq(savedSearch.id, s.id));
      }
      return { status: "succeeded", message: `${searches.length} saved search(es) refreshed; ${notified} notified.` };
    }
    case "deposit_deadline_reminder": {
      const deps = await db.select().from(depositRecord).where(and(isNotNull(depositRecord.tenancyEndedOn), inArray(depositRecord.status, ["tenancy_ended", "partially_returned", "landlord_claim_filed", "disputed"])));
      let n = 0;
      for (const d of deps) {
        const dl = depositReturnDeadline(d.tenancyEndedOn!);
        if (!dl) continue;
        const days = Math.round((new Date(dl).getTime() - new Date(today).getTime()) / 86400000);
        if (days <= 3) if (await notify(d.ownerId, { category: "deadline", title: days >= 0 ? `Deposit deadline in ${days} day(s)` : "Deposit deadline has passed", body: `The 10-day return/claim period ${days >= 0 ? "ends" : "ended"} on ${dl}. Review your options in Deposit protection.`, link: "/deposit-protection", dedupeKey: `dep:${d.id}:${days >= 0 ? "soon" : "passed"}` })) n++;
      }
      return { status: "succeeded", message: `${deps.length} deposit(s) checked; ${n} reminder(s).` };
    }
    case "maintenance_followup": {
      const cases = await db.select().from(maintenanceCase).where(and(isNotNull(maintenanceCase.promisedBy), lt(maintenanceCase.promisedBy, today)));
      let n = 0;
      for (const c of cases.filter((x) => x.status !== "tenant_confirmed_resolved" && x.status !== "closed_unresolved")) {
        if (await notify(c.ownerId, { category: "deadline", title: "Promised repair date has passed", body: `“${c.title}” was promised by ${c.promisedBy}. Consider a written follow-up.`, link: `/maintenance/${c.id}`, dedupeKey: `mnt:${c.id}:${c.promisedBy}` })) n++;
      }
      return { status: "succeeded", message: `${n} follow-up reminder(s).` };
    }
    case "legal_source_review": {
      const sources = await db.select().from(legalSource);
      const changed: string[] = [];
      for (const s of sources) {
        let code = 0;
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10000);
          const r = await fetch(s.url, { method: "GET", signal: ctrl.signal, headers: { "User-Agent": "SafeLease legal-source availability check" } });
          clearTimeout(t);
          code = r.status;
          await r.body?.cancel();
        } catch {
          code = 0;
        }
        const status = code === 200 ? s.status : "unreachable";
        if (status !== s.status) changed.push(s.sourceKey);
        await db.update(legalSource).set({ lastCheckedAt: new Date(), lastCheckHttpStatus: code, status: status === "unreachable" ? "needs_review" : s.status }).where(eq(legalSource.id, s.id));
      }
      if (changed.length) {
        const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, "platform_admin"));
        for (const a of admins) await notify(a.id, { category: "system", title: "Legal sources need review", body: `${changed.join(", ")} could not be reached. Rules are unchanged until an administrator reviews them.`, link: "/admin/sources", dedupeKey: `src:${today}:${a.id}` });
      }
      return { status: "succeeded", message: `${sources.length} source(s) checked; ${changed.length} need review. Availability only — text changes require manual review.` };
    }
    case "retention_cleanup": {
      const profiles = await db.select().from(userProfile).where(isNotNull(userProfile.retentionDays));
      let removed = 0;
      for (const p of profiles) {
        const cutoff = new Date(Date.now() - p.retentionDays! * 86400000);
        const res = await db.delete(investigation).where(and(eq(investigation.ownerId, p.userId), eq(investigation.status, "closed"), lte(investigation.closedAt, cutoff))).returning({ id: investigation.id });
        removed += res.length;
      }
      return { status: "succeeded", message: `${removed} closed case(s) removed per retention settings.` };
    }
  }
}

export async function runDueJobs(trigger: Trigger, opts: { limit?: number; jobId?: string } = {}) {
  await sweepStaleRuns();
  const now = new Date();
  const due = opts.jobId
    ? await db.select().from(monitoringJob).where(eq(monitoringJob.id, opts.jobId))
    : await db.select().from(monitoringJob).where(and(eq(monitoringJob.status, "active"), lte(monitoringJob.nextRunAt, now))).limit(opts.limit ?? 25);
  const results: Array<{ id: string; type: string; status: string; message: string }> = [];
  for (const job of due) {
    const started = new Date();
    let r: { status: "succeeded" | "failed" | "skipped"; message: string };
    try {
      r = await runOne(job);
    } catch (e) {
      r = { status: "failed", message: e instanceof Error ? e.message.slice(0, 200) : "Job failed" };
    }
    await db.insert(jobRun).values({ id: newId("jr"), jobId: job.id, trigger, status: r.status, message: r.message, startedAt: started, finishedAt: new Date() });
    await db.update(monitoringJob).set({ lastRunAt: new Date(), lastStatus: r.status, lastMessage: r.message, nextRunAt: new Date(Date.now() + job.intervalHours * 3600_000) }).where(eq(monitoringJob.id, job.id));
    results.push({ id: job.id, type: job.jobType, ...r });
  }
  return results;
}

void sql;
