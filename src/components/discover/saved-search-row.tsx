"use client";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteSearchAction } from "@/server/actions/discovery";

export function SavedSearchRow({ s }: { s: { id: string; name: string; filters: Record<string, string>; alertsEnabled: boolean; lastRunAt: string | null; lastResultCount: number | null } }) {
  const q = new URLSearchParams(Object.entries(s.filters).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
      <div>
        <Link href={`/discover?${q}`} className="font-medium hover:underline">{s.name}</Link>
        <div className="text-xs text-muted-foreground">{Object.entries(s.filters).map(([k, v]) => `${k}: ${v}`).join(" · ") || "Any"}</div>
      </div>
      <div className="flex items-center gap-2">
        {s.alertsEnabled ? <Badge tone="info">Alerts on{s.lastRunAt ? ` · last ${s.lastResultCount ?? 0} results` : " · not run yet"}</Badge> : null}
        <Button variant="ghost" size="icon" aria-label={`Delete saved search ${s.name}`} onClick={async () => { const r = await deleteSearchAction({ id: s.id }); if (!r.ok) toast.error(r.error); }}><Trash2 /></Button>
      </div>
    </div>
  );
}
