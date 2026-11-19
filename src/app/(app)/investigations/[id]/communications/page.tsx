import { ArrowDownLeft, ArrowUpRight, MessageSquare } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getBoard } from "@/server/services/board";
import { listCommunications } from "@/server/services/communications";
import { getEmailProvider } from "@/server/providers/email";
import { llm } from "@/server/providers/llm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/misc";
import { ProviderBadge } from "@/components/status/status-badge";
import { DraftEditor } from "@/components/investigation/draft-editor";
import { NewDraftForm } from "@/components/investigation/new-draft-form";
import { EvidenceForm } from "@/components/investigation/evidence-form";
import { QuestionsList } from "@/components/investigation/questions-actions";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

export default async function CommunicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [b, history] = await Promise.all([getBoard(user.id, id), listCommunications(user.id, id)]);
  const email = getEmailProvider().info();
  const msgs = b.evidence.filter((e) => e.kind === "landlord_message" || e.kind === "landlord_response");
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Email delivery:</span> <ProviderBadge status={email.status} />
          <span className="text-xs text-muted-foreground">{email.statusMessage}</span>
        </div>
        {b.drafts.length === 0 ? <EmptyState icon={<MessageSquare />} title="No drafts yet" description="Create one from the panel, or let the agent prepare questions after it reviews your evidence." /> : null}
        {b.drafts.map((d) => (
          <DraftEditor key={d.id} d={d} emailStatus={email.status} />
        ))}
        <Card>
          <CardHeader>
            <CardTitle>Message history</CardTitle>
            <CardDescription>Landlord messages you added as evidence, and messages you recorded as sent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...msgs.map((m) => ({ id: m.id, dir: "inbound" as const, when: m.occurredAt ?? m.createdAt, title: m.title, body: m.textContent ?? "(file only)" })), ...history.filter((h) => h.direction === "outbound").map((h) => ({ id: h.id, dir: "outbound" as const, when: h.occurredAt ?? h.createdAt, title: h.channel === "email" ? "Sent via email provider" : "Recorded as sent by you", body: h.body }))]
              .sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime())
              .map((m) => (
                <div key={m.id} className={`max-w-[90%] rounded-lg border border-border p-3 text-sm ${m.dir === "outbound" ? "ml-auto bg-accent/50" : "bg-card"}`}>
                  <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {m.dir === "inbound" ? <ArrowDownLeft className="size-3.5" aria-hidden /> : <ArrowUpRight className="size-3.5" aria-hidden />}
                    {m.title} · {formatDateTime(m.when)}
                  </div>
                  <p className="whitespace-pre-wrap">{m.body.slice(0, 2000)}</p>
                </div>
              ))}
            {msgs.length === 0 && history.length === 0 ? <p className="text-sm text-muted-foreground">No messages recorded.</p> : null}
            <Button asChild variant="outline" size="sm"><a href={`/api/reports/correspondence/${id}?format=pdf`}>Export correspondence (PDF)</a></Button>
          </CardContent>
        </Card>
      </div>
      <aside className="space-y-4">
        <Card>
          <CardHeader><CardTitle>New draft</CardTitle></CardHeader>
          <CardContent><NewDraftForm investigationId={id} aiAvailable={llm().configured()} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Unanswered questions</CardTitle></CardHeader>
          <CardContent><QuestionsList questions={b.questions} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Record a reply you received</CardTitle>
            <CardDescription>Paste the reply or upload a screenshot. The agent re-checks the case with the new information.</CardDescription>
          </CardHeader>
          <CardContent>
            <EvidenceForm investigationId={id} existing={[]} />
          </CardContent>
        </Card>
        <Callout tone="neutral">Avoid replying through links the advertiser sends you. Use the platform's own messaging or contact details you found independently.</Callout>
      </aside>
    </div>
  );
}
