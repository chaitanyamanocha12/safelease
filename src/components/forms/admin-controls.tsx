"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ProviderBadge } from "@/components/status/status-badge";
import { healthCheckAction, resetDemoAction, runJobsAction, setFlagAction } from "@/server/actions/admin";

export function FlagSwitch({ k, enabled, label }: { k: string; enabled: boolean; label: string }) {
  const [v, setV] = useState(enabled);
  return <Switch id={`flag-${k}`} label={label} checked={v} onCheckedChange={async (n) => { setV(n); const r = await setFlagAction({ key: k, enabled: n }); if (!r.ok) { setV(!n); toast.error(r.error); } }} />;
}

export function HealthCheckPanel() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Array<{ id: string; name: string; status: string; message: string; latencyMs: number | null }> | null>(null);
  return (
    <div className="space-y-3">
      <Button onClick={async () => { setBusy(true); const r = await healthCheckAction({}); setBusy(false); if (!r.ok) return toast.error(r.error); setRes(r.data); }} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} Run live health checks</Button>
      {res ? <ul className="space-y-1 text-sm">{res.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2"><ProviderBadge status={x.status} /><span className="font-medium">{x.name}</span><span className="text-muted-foreground">{x.message}{x.latencyMs !== null ? ` (${x.latencyMs} ms)` : ""}</span></li>)}</ul> : null}
    </div>
  );
}

export function RunJobsButton({ jobId, label = "Run due jobs now" }: { jobId?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button size={jobId ? "sm" : "default"} variant={jobId ? "ghost" : "default"} disabled={busy} onClick={async () => { setBusy(true); const r = await runJobsAction({ jobId }); setBusy(false); if (!r.ok) return toast.error(r.error); toast.success(r.data.length ? r.data.map((x) => `${x.type}: ${x.status}`).join(" · ") : "No jobs were due."); router.refresh(); }}>
      {busy ? <Loader2 className="animate-spin" /> : null} {label}
    </Button>
  );
}

export function ResetDemoButton() {
  const router = useRouter();
  return <ConfirmDialog trigger={<Button variant="destructive">Reset demo environment</Button>} title="Reset all demo data?" description="Deletes every demo-flagged account, case, listing and organization, then re-seeds them. Non-demo data is not touched. You'll be signed out if you're using a demo account." destructive confirmLabel="Reset demo" onConfirm={async () => { const r = await resetDemoAction({ confirm: true }); if (!r.ok) toast.error(r.error); else { toast.success("Demo environment reset."); router.push("/login"); } }} />;
}
