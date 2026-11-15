import { Bot, Settings2, User } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getBoard } from "@/server/services/board";
import { db } from "@/server/db/client";
import { toolRun } from "@/server/db/schema";
import { desc, eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModeBadge, ToolStatusBadge } from "@/components/status/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { TOOL_LABELS } from "@/components/investigation/tool-labels";

const ICON = { user: User, agent: Bot, system: Settings2 } as const;

export default async function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const b = await getBoard(user.id, id);
  const tools = await db.select().from(toolRun).where(eq(toolRun.investigationId, id)).orderBy(desc(toolRun.startedAt)).limit(200);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Case timeline</CardTitle></CardHeader>
        <CardContent>
          <ol className="relative space-y-4 border-l border-border pl-5">
            {b.events.map((e) => {
              const Icon = ICON[e.actor];
              return (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[29px] flex size-6 items-center justify-center rounded-full border border-border bg-card"><Icon className="size-3.5 text-muted-foreground" aria-hidden /></span>
                  <p className="text-sm">{e.message}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)} · {e.actor === "agent" ? "SafeLease agent" : e.actor === "user" ? "You" : "System"}</p>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Tool execution history</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {b.runs.map((r) => (
            <div key={r.id} className="rounded-lg border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
                <span className="font-medium">Run {formatDateTime(r.startedAt)} · {r.trigger.replace("_", " ")}</span>
                <div className="flex gap-1">
                  <Badge tone="outline">{r.plannerMode === "llm" ? "AI planner" : "Deterministic planner"}</Badge>
                  <Badge tone={r.status === "completed" ? "ok" : r.status === "failed" ? "bad" : "warn"}>{r.status.replace("_", " ")}</Badge>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {tools.filter((t) => t.agentRunId === r.id).reverse().map((t) => (
                  <li key={t.id} className="px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{TOOL_LABELS[t.tool] ?? t.tool} <span className="text-muted-foreground">· iteration {t.iteration}{t.durationMs !== null ? ` · ${t.durationMs} ms` : ""}</span></span>
                      <div className="flex gap-1"><ModeBadge mode={t.mode} /><ToolStatusBadge status={t.status} /></div>
                    </div>
                    <p className="mt-1 text-muted-foreground">{(t.output as { summary?: string } | null)?.summary ?? t.error ?? ""}</p>
                    {t.reason ? <p className="text-muted-foreground/80">Why: {t.reason}</p> : null}
                  </li>
                ))}
              </ul>
              {r.summary ? <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{r.summary}</p> : null}
            </div>
          ))}
          {b.runs.length === 0 ? <p className="text-sm text-muted-foreground">No runs yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
