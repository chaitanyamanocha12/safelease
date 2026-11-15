import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, X } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getDispute, type DisputePackage } from "@/server/services/disputes";
import { AppError } from "@/server/errors";
import { formatDate, titleCase } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/misc";
import { Field, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { SimpleActionButton } from "@/components/forms/simple-action-button";
import { deleteDisputeAction, rebuildDisputeAction, updateDisputeAction } from "@/server/actions/tenancy";

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let d;
  try {
    d = await getDispute(user.id, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const p = d.package as unknown as DisputePackage;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex gap-1.5">{d.isDemo ? <Badge tone="demo">DEMO</Badge> : null}<Badge tone="outline">{titleCase(d.disputeType)}</Badge><Badge tone="outline">{titleCase(d.status)}</Badge></div>
          <h1 className="text-2xl font-semibold tracking-tight">{d.title}</h1>
          <p className="text-xs text-muted-foreground">Generated {formatDate(p.generatedAt, { dateStyle: "medium", timeStyle: "short" })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SimpleActionButton action={rebuildDisputeAction} args={{ id }} variant="outline" success="Package refreshed from your latest records">Refresh from records</SimpleActionButton>
          <Button asChild><Link href={`/api/reports/dispute/${id}?format=pdf`}><FileDown /> Evidence package (PDF)</Link></Button>
          <SimpleActionButton action={deleteDisputeAction} args={{ id }} variant="ghost" redirectTo="/disputes">Delete</SimpleActionButton>
        </div>
      </div>
      <Callout tone="neutral">Review and correct everything before sharing. Items you remove are excluded from the PDF; your underlying records are not changed.</Callout>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Case summary (editable)</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={updateDisputeAction} extra={{ id }} reset={false} className="space-y-3">
              <Textarea name="summary" rows={7} defaultValue={p.summary} aria-label="Case summary" />
              <Field label="Status" htmlFor="ds"><Select id="ds" name="status" defaultValue={d.status}><option value="drafting">Drafting</option><option value="ready_for_review">Ready for review</option><option value="archived">Archived</option></Select></Field>
              <SubmitButton size="sm">Save</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Outstanding facts</CardTitle></CardHeader>
          <CardContent>{p.outstandingFacts.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{p.outstandingFacts.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="text-sm text-muted-foreground">None identified.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
          <CardContent><ol className="space-y-2 text-sm">{p.timeline.map((t, i) => <li key={i} className="flex gap-3"><span className="w-24 shrink-0 text-xs text-muted-foreground">{formatDate(t.date)}</span><span>{t.event} <span className="text-xs text-muted-foreground">({t.source})</span></span></li>)}</ol></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Supporting evidence</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {p.evidence.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-sm">
                <div><div className="font-medium">{e.label}</div><div className="text-xs text-muted-foreground">{e.detail}</div></div>
                <SimpleActionButton action={updateDisputeAction} args={{ id, excludeItemId: e.id }} variant="ghost" size="icon" aria-label={`Remove ${e.label} from package`}><X /></SimpleActionButton>
              </div>
            ))}
            {d.excludedItemIds.length ? <p className="text-xs text-muted-foreground">{d.excludedItemIds.length} item(s) excluded. <SimpleActionButton action={updateDisputeAction} args={{ id, includeItemId: d.excludedItemIds[0] }} variant="link" size="sm">Restore last</SimpleActionButton></p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Documents ({p.documents.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {p.documents.map((doc) => <div key={doc.id} className="flex items-center justify-between gap-2"><a className="text-blue hover:underline" href={`/api/files/doc/${doc.id}`} target="_blank">{doc.title}</a><span className="flex items-center gap-1 text-xs text-muted-foreground">{titleCase(doc.type)} · {doc.uploaded}<SimpleActionButton action={updateDisputeAction} args={{ id, excludeItemId: `doc:${doc.id}` }} variant="ghost" size="icon" aria-label="Exclude document"><X /></SimpleActionButton></span></div>)}
            {p.documents.length === 0 ? <p className="text-muted-foreground">No linked documents.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Official sources & questions for legal advice</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-1.5">{p.sources.map((s) => <li key={s.title}><a href={s.url} className="text-blue hover:underline" target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}</ul>
            <ul className="list-disc space-y-1 pl-5">{p.questionsForLegalAdvice.map((q) => <li key={q}>{q}</li>)}</ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
