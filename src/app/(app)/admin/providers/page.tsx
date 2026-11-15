import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/auth/session";
import { allProviderInfo } from "@/server/providers/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout, PageHeader } from "@/components/ui/misc";
import { ProviderBadge } from "@/components/status/status-badge";
import { AdminNav } from "@/components/shell/admin-nav";
import { HealthCheckPanel } from "@/components/forms/admin-controls";

export const metadata: Metadata = { title: "Providers" };

export default async function ProvidersPage() {
  await requirePlatformAdmin();
  const infos = allProviderInfo();
  return (
    <>
      <PageHeader title="Provider configuration" description="Status is derived from server-side configuration. Secrets are never displayed." />
      <AdminNav active="/admin/providers" />
      <Callout tone="neutral" className="mb-6">“LIVE” here means configured. Connectivity is confirmed only by a successful live health check below. No failed provider is ever replaced with fabricated results.</Callout>
      <Card className="mb-6"><CardHeader><CardTitle>Live health checks</CardTitle></CardHeader><CardContent><HealthCheckPanel /></CardContent></Card>
      <div className="grid gap-4 md:grid-cols-2">
        {infos.map((p) => (
          <Card key={`${p.category}-${p.id}`}>
            <CardHeader className="flex-row items-start justify-between gap-2">
              <div><div className="text-xs uppercase tracking-wide text-muted-foreground">{p.category.replace("_", " ")}</div><CardTitle>{p.name}</CardTitle></div>
              <ProviderBadge status={p.status} />
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p className="text-muted-foreground">{p.description}</p>
              <p>{p.statusMessage}</p>
              <p className="text-xs text-muted-foreground">Env: {p.requiredEnv.join(", ") || "none"}{p.timeoutMs ? ` · timeout ${p.timeoutMs} ms` : ""}{p.retries !== undefined ? ` · retries ${p.retries}` : ""}{p.rateLimit ? ` · ${p.rateLimit}` : ""}</p>
              {p.dataRestrictions ? <p className="text-xs text-muted-foreground">Data: {p.dataRestrictions}</p> : null}
              {p.attribution ? <p className="text-xs text-muted-foreground">Attribution: {p.attribution}</p> : null}
              {p.docsUrl ? <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue hover:underline">Documentation</a> : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
