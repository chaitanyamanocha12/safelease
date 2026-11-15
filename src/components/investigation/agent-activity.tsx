"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModeBadge, ToolStatusBadge } from "@/components/status/status-badge";
import { Progress } from "@/components/ui/misc";
import { cancelRunAction, runInvestigationAction } from "@/app/(app)/investigations/actions";
import { TOOL_LABELS } from "./tool-labels";

interface RunInfo {
  id: string;
  status: string;
  plannerMode: string;
  plannerNote: string | null;
  iterations: number;
  toolCalls: number;
  maxToolCalls: number;
  summary: string | null;
  startedAt: string;
  finishedAt: string | null;
}
interface ToolInfo {
  id: string;
  tool: string;
  status: string;
  mode: string;
  reason: string | null;
  summary: string | null;
  iteration: number;
  durationMs: number | null;
}

const ACTIVE = new Set(["queued", "running"]);

export function AgentActivity({ investigationId, initialRun, initialTools, aiLabel, compact }: { investigationId: string; initialRun: RunInfo | null; initialTools: ToolInfo[]; aiLabel: string; compact?: boolean }) {
  const router = useRouter();
  const [run, setRun] = useState<RunInfo | null>(initialRun);
  const [tools, setTools] = useState<ToolInfo[]>(initialTools);
  const [starting, setStarting] = useState(false);
  const wasActive = useRef(initialRun ? ACTIVE.has(initialRun.status) : false);

  useEffect(() => {
    if (!run || !ACTIVE.has(run.status)) return;
    const ctrl = new AbortController();
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/investigations/${investigationId}/activity`, { signal: ctrl.signal, cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { run: RunInfo | null; tools: ToolInfo[] };
        setRun(data.run);
        setTools(data.tools);
        if (data.run && !ACTIVE.has(data.run.status) && wasActive.current) {
          wasActive.current = false;
          router.refresh();
        }
      } catch {
        /* polling errors are non-fatal */
      }
    }, 1200);
    return () => {
      clearInterval(timer);
      ctrl.abort();
    };
  }, [run, investigationId, router]);

  async function start() {
    setStarting(true);
    const r = await runInvestigationAction({ investigationId });
    setStarting(false);
    if (!r.ok) return toast.error(r.error);
    wasActive.current = true;
    setRun({ id: r.data.runId, status: "queued", plannerMode: "", plannerNote: null, iterations: 0, toolCalls: 0, maxToolCalls: 1, summary: null, startedAt: new Date().toISOString(), finishedAt: null });
    setTools([]);
  }

  const active = run ? ACTIVE.has(run.status) : false;
  const visible = compact ? tools.slice(-6) : tools;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-4 text-teal" aria-hidden /> Agent activity
          </CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">{aiLabel}</p>
        </div>
        {active ? (
          <Button size="sm" variant="outline" onClick={async () => { if (run) { const r = await cancelRunAction({ runId: run.id }); if (!r.ok) toast.error(r.error); else toast("Cancellation requested."); } }}>
            <Square /> Stop
          </Button>
        ) : (
          <Button size="sm" variant="teal" onClick={start} disabled={starting}>
            {starting ? <Loader2 className="animate-spin" /> : <Play />} Re-run checks
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {run ? (
          <div aria-live="polite" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Run status: <strong className="text-foreground">{run.status.replace("_", " ")}</strong> · {run.toolCalls}/{run.maxToolCalls} tool calls · iteration {run.iterations || 1}
              </span>
            </div>
            {active ? <Progress value={(run.toolCalls / Math.max(1, run.maxToolCalls)) * 100 + 8} label="Investigation run progress" /> : null}
            {run.plannerNote ? <p className="text-xs text-muted-foreground">{run.plannerNote}</p> : null}
            {run.summary && !active ? <p className="text-xs text-muted-foreground">{run.summary}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No runs yet. Add evidence to start an investigation run.</p>
        )}
        <ol className="space-y-2">
          {visible.map((t) => (
            <li key={t.id} className="rounded-md border border-border p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{TOOL_LABELS[t.tool] ?? t.tool}</span>
                <div className="flex items-center gap-1.5">
                  {t.status !== "running" ? <ModeBadge mode={t.mode} /> : null}
                  <ToolStatusBadge status={t.status} />
                </div>
              </div>
              {t.summary ? <p className="mt-1 text-xs text-muted-foreground">{t.summary}</p> : null}
              {!compact && t.reason ? <p className="mt-1 text-[11px] text-muted-foreground/80">Why: {t.reason}</p> : null}
            </li>
          ))}
          {active && tools.length === 0 ? (
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Planning…
            </li>
          ) : null}
        </ol>
        {compact && tools.length > visible.length ? <p className="text-xs text-muted-foreground">+ {tools.length - visible.length} earlier step(s) — see Timeline.</p> : null}
      </CardContent>
    </Card>
  );
}
