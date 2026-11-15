"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Copy, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { actionStatusAction, enableMonitoringAction } from "@/app/(app)/investigations/actions";

export function QuestionsList({ questions }: { questions: Array<{ key: string; question: string; reason: string }> }) {
  if (questions.length === 0) return <p className="text-sm text-muted-foreground">No open questions right now.</p>;
  return (
    <ol className="space-y-2">
      {questions.map((q, i) => (
        <li key={q.key} className="group flex gap-3 rounded-md border border-border p-3 text-sm">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p>{q.question}</p>
            <p className="mt-1 text-xs text-muted-foreground">Because: {q.reason}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copy question"
            onClick={async () => {
              await navigator.clipboard.writeText(q.question);
              toast.success("Question copied");
            }}
          >
            <Copy />
          </Button>
        </li>
      ))}
    </ol>
  );
}

interface ActionView {
  id: string;
  actionType: string;
  title: string;
  description: string;
  status: string;
  verificationNote: string | null;
  messageDraftId: string | null;
}

export function ActionsList({ actions, investigationId }: { actions: ActionView[]; investigationId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (actions.length === 0) return <p className="text-sm text-muted-foreground">No proposed actions.</p>;
  const set = async (a: ActionView, status: "approved" | "dismissed" | "completed_by_user") => {
    setBusy(a.id);
    const r = a.actionType === "enable_monitoring" && status === "approved" ? await enableMonitoringAction({ investigationId, actionId: a.id }) : await actionStatusAction({ actionId: a.id, investigationId, status });
    setBusy(null);
    if (!r.ok) toast.error(r.error);
  };
  return (
    <ul className="space-y-2">
      {actions.map((a) => {
        const href = a.description.match(/(\/discover\?[^\s]+)/)?.[1];
        return (
          <li key={a.id} className="rounded-md border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{a.title}</span>
              <Badge tone={a.status === "proposed" ? "info" : a.status === "dismissed" ? "outline" : a.status === "submitted" ? "ok" : "teal"}>
                {a.status === "proposed" ? "Proposed — awaiting you" : a.status.replace(/_/g, " ")}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{href ? a.description.replace(href, "") : a.description}</p>
            {a.verificationNote ? <p className="mt-1 text-xs text-foreground/80"><CheckCircle2 className="mr-1 inline size-3 text-teal" />{a.verificationNote}</p> : null}
            {a.status === "proposed" ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.actionType === "send_message" ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/investigations/${investigationId}/communications${a.messageDraftId ? `#draft-${a.messageDraftId}` : ""}`}><MessageSquare /> Review draft</Link>
                  </Button>
                ) : href ? (
                  <Button asChild size="sm" variant="outline"><Link href={href}>Open Discover</Link></Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => set(a, "approved")}>Approve</Button>
                )}
                <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => set(a, "dismissed")}><X /> Dismiss</Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
