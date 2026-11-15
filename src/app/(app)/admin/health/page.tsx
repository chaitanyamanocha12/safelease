import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { requirePlatformAdmin } from "@/server/auth/session";
import { jobsStatus } from "@/server/services/admin";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { AdminNav } from "@/components/shell/admin-nav";
import { RunJobsButton } from "@/components/forms/admin-controls";
import { formatDateTime, timed } from "@/lib/utils";

export const metadata: Metadata = { title: "Health & jobs" };

export default async function HealthPage() {
  const admin = await requirePlatformAdmin();
  const { jobs, runs } = await jobsStatus(admin);
  const probe = await timed(() => db.run(sql`select 1`));
  const dbOk = probe.ok;
  const dbMs = probe.ms;
  const cron = Boolean(env().CRON_SECRET);
  return (
    <>
      <PageHeader title="Service health & monitoring jobs" />
      <AdminNav active="/admin/health" />
      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <Badge tone={dbOk ? "ok" : "bad"}>Database {dbOk ? `OK (${dbMs} ms)` : "ERROR"}</Badge>
        <Badge tone="outline">{env().DATABASE_URL.startsWith("file:") ? "Local SQLite file" : "Remote libSQL"}</Badge>
        <Badge tone={cron ? "ok" : "neutral"}>Scheduler: {cron ? "cron endpoint protected" : "not configured"}</Badge>
      </div>
      {!cron ? <Callout tone="warn" className="mb-6">No external scheduler is configured, so jobs run only when triggered here or with <code>npm run jobs:run</code>. Scheduled monitoring does not happen on its own.</Callout> : null}
      <div className="mb-4"><RunJobsButton /></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Jobs</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table><thead><tr><Th>Type</Th><Th>Status</Th><Th>Next</Th><Th>Last</Th><Th /></tr></thead>
              <tbody>{jobs.map((j) => <tr key={j.id}><Td>{j.jobType.replace(/_/g, " ")}{j.ownerId ? " (user)" : " (system)"}</Td><Td><Badge tone={j.status === "active" ? "ok" : "outline"}>{j.status}</Badge></Td><Td className="text-xs">{formatDateTime(j.nextRunAt)}</Td><Td className="text-xs">{j.lastStatus ? `${j.lastStatus}: ${j.lastMessage ?? ""}` : "never"}</Td><Td><RunJobsButton jobId={j.id} label="Run" /></Td></tr>)}</tbody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent job runs</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">{runs.length === 0 ? <p className="text-muted-foreground">No runs yet.</p> : runs.map((r) => <div key={r.id}><Badge tone={r.status === "succeeded" ? "ok" : r.status === "failed" ? "bad" : "outline"}>{r.status}</Badge> <span className="text-xs text-muted-foreground">{formatDateTime(r.startedAt)} · {r.trigger}</span> {r.message}</div>)}</CardContent>
        </Card>
      </div>
    </>
  );
}
