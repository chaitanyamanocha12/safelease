"use client";
import { useState } from "react";
import { Check, ClipboardCopy, Loader2, Mail, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import { approveDraftAction, copiedDraftAction, deleteDraftAction, markSentAction, sendDraftAction, updateDraftAction } from "@/server/actions/communications";

interface Draft {
  id: string;
  subject: string;
  body: string;
  recipient: string | null;
  status: string;
  generatedBy: string;
  purpose: string;
  providerMessageId: string | null;
  providerError: string | null;
  updatedAt: Date | string;
}

const STATUS: Record<string, { label: string; tone: "info" | "teal" | "ok" | "neutral" | "bad" }> = {
  draft: { label: "Draft — not sent", tone: "info" },
  approved: { label: "Approved — not sent", tone: "teal" },
  copied: { label: "Copied — not sent by SafeLease", tone: "neutral" },
  submitted: { label: "Accepted by email provider", tone: "ok" },
  failed: { label: "Send failed", tone: "bad" },
  marked_sent_by_user: { label: "You sent it yourself", tone: "neutral" },
};

export function DraftEditor({ d, emailStatus }: { d: Draft; emailStatus: string }) {
  const [subject, setSubject] = useState(d.subject);
  const [body, setBody] = useState(d.body);
  const [recipient, setRecipient] = useState(d.recipient ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = subject !== d.subject || body !== d.body || recipient !== (d.recipient ?? "");
  const locked = d.status === "submitted";
  const st = STATUS[d.status] ?? STATUS.draft!;
  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, success?: string) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) toast.error((r as { error: string }).error);
    else if (success) toast.success(success);
    return r;
  };
  return (
    <Card id={`draft-${d.id}`} className="scroll-mt-24">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={st.tone}>{st.label}</Badge>
            <Badge tone={d.generatedBy === "llm" ? "review" : "outline"}>{d.generatedBy === "llm" ? "AI-polished draft" : d.generatedBy === "template" ? "Template draft" : "Your draft"}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">Updated {formatDateTime(d.updatedAt)}</span>
        </div>
        <Field label="To" htmlFor={`to-${d.id}`} hint="Prefer contact details you found independently over ones the advertiser gave you.">
          <Input id={`to-${d.id}`} value={recipient} disabled={locked} onChange={(e) => setRecipient(e.target.value)} placeholder="email@example.com" />
        </Field>
        <Field label="Subject" htmlFor={`sub-${d.id}`}>
          <Input id={`sub-${d.id}`} value={subject} disabled={locked} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message" htmlFor={`body-${d.id}`}>
          <Textarea id={`body-${d.id}`} value={body} disabled={locked} onChange={(e) => setBody(e.target.value)} rows={10} />
        </Field>
        {d.providerError ? <p className="text-xs text-bad">Last send error: {d.providerError}</p> : null}
        {d.providerMessageId ? <p className="text-xs text-muted-foreground">Provider message id: {d.providerMessageId}. Acceptance is not proof of delivery or reading.</p> : null}
        {!locked ? (
          <div className="flex flex-wrap gap-2">
            {dirty ? (
              <Button size="sm" disabled={busy !== null} onClick={() => run("save", () => updateDraftAction({ id: d.id, subject, body, recipient }), "Draft saved")}>
                {busy === "save" ? <Loader2 className="animate-spin" /> : null} Save changes
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(`${subject}\n\n${body}`);
                await copiedDraftAction({ id: d.id });
                toast.success("Copied. Paste it into your email or the rental platform.");
              }}
            >
              <ClipboardCopy /> Copy
            </Button>
            {d.status !== "approved" ? (
              <Button size="sm" variant="outline" disabled={dirty || busy !== null} onClick={() => run("approve", () => approveDraftAction({ id: d.id }), "Approved. It has not been sent.")}>
                <Check /> Approve
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="teal"
              disabled={dirty || d.status !== "approved" || busy !== null || emailStatus === "NOT_CONFIGURED"}
              title={emailStatus === "NOT_CONFIGURED" ? "Email sending is not configured — copy the message instead." : d.status !== "approved" ? "Approve the message first" : undefined}
              onClick={async () => {
                setBusy("send");
                const r = await sendDraftAction({ id: d.id });
                setBusy(null);
                if (!r.ok) return toast.error(r.error);
                const o = r.data as { outcome: string; message: string };
                if (o.outcome === "submitted") toast.success(o.message);
                else toast.warning(o.message);
              }}
            >
              {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} Send via email{emailStatus === "DEMO" ? " (DEMO log)" : ""}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("sent", () => markSentAction({ id: d.id }), "Recorded as sent by you.")}>
              <Mail /> I sent it myself
            </Button>
            <ConfirmDialog trigger={<Button size="sm" variant="ghost" aria-label="Delete draft"><Trash2 /></Button>} title="Delete this draft?" description="The draft will be removed. Messages already recorded in your history are kept." destructive confirmLabel="Delete" onConfirm={async () => { await deleteDraftAction({ id: d.id }); }} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
