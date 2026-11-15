import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/auth/session";
import { overview } from "@/server/services/admin";
import { demoModeEnabled } from "@/server/env";
import { aiModeLabel } from "@/server/providers/registry";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Stat, Table, Td, Th } from "@/components/ui/misc";
import { AdminNav } from "@/components/shell/admin-nav";
import { FlagSwitch, ResetDemoButton } from "@/components/forms/admin-controls";
import { BarList } from "@/components/charts/bar-list";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const admin = await requirePlatformAdmin();
  const o = await overview(admin);
  const total = o.toolStats.reduce((s, t) => s + Number(t.n), 0);
  const ok = Number(o.toolStats.find((t) => t.status === "succeeded")?.n ?? 0);
  return (
    <>
      <PageHeader eyebrow="Platform administration" title="Admin" description={aiModeLabel().label} />
      <AdminNav active="/admin" />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Users" value={o.users} />
        <Stat label="Investigations" value={o.cases} />
        <Stat label="Agent runs (30d)" value={o.runs} />
        <Stat label="Tool success (30d)" value={total ? `${Math.round((ok / total) * 100)}%` : "—"} hint={`${total} tool runs; unavailable providers are not failures`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Tool runs by status (30 days)</CardTitle></CardHeader><CardContent><BarList title="Tool runs by status" data={o.toolStats.map((t) => ({ label: t.status.replace(/_/g, " "), value: Number(t.n) }))} /></CardContent></Card>
        <Card>
          <CardHeader><CardTitle>AI usage (30 days)</CardTitle><CardDescription>Estimated cost from token counts; check your provider's billing for actual charges.</CardDescription></CardHeader>
          <CardContent>
            {o.usage.length === 0 ? <p className="text-sm text-muted-foreground">No LLM calls recorded.</p> : (
              <Table><thead><tr><Th>Model</Th><Th>Calls</Th><Th>Tokens in/out</Th><Th>Est. cost</Th><Th>Failed</Th></tr></thead><tbody>{o.usage.map((u) => <tr key={u.model}><Td>{u.model}</Td><Td>{u.calls}</Td><Td>{u.input}/{u.output}</Td><Td>${Number(u.cost).toFixed(3)}</Td><Td>{u.failed}</Td></tr>)}</tbody></Table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Feature availability</CardTitle></CardHeader>
          <CardContent className="space-y-2">{o.flags.map((f) => <div key={f.key} className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-sm"><div><div className="font-medium">{f.key}</div><div className="text-xs text-muted-foreground">{f.description}</div></div><FlagSwitch k={f.key} enabled={f.enabled} label={f.key} /></div>)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Organizations</CardTitle></CardHeader>
          <CardContent><Table><thead><tr><Th>Name</Th><Th>Type</Th><Th>Min group</Th></tr></thead><tbody>{o.orgs.map((g) => <tr key={g.id}><Td>{g.name} {g.isDemo ? <Badge tone="demo">DEMO</Badge> : null}</Td><Td>{g.orgType.replace("_", " ")}</Td><Td>{g.minAggregateGroupSize}</Td></tr>)}</tbody></Table></CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Recent errors</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {o.errors.length === 0 && o.failedRuns.length === 0 ? <p className="text-muted-foreground">No recent errors.</p> : null}
            {o.errors.map((e, i) => <div key={i}><Badge tone="bad">tool</Badge> {e.tool}: {e.error} <span className="text-xs text-muted-foreground">{formatDateTime(e.at)}</span></div>)}
            {o.failedRuns.map((e) => <div key={e.id}><Badge tone="bad">run</Badge> {e.error} <span className="text-xs text-muted-foreground">{formatDateTime(e.at)}</span></div>)}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Demo environment</CardTitle><CardDescription>{demoModeEnabled() ? "DEMO_MODE is enabled on this server." : "DEMO_MODE is off; demo reset is unavailable."}</CardDescription></CardHeader>
          <CardContent>{demoModeEnabled() ? <ResetDemoButton /> : null}</CardContent>
        </Card>
      </div>
    </>
  );
}
