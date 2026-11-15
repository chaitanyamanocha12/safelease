import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { AlertTriangle, CircleHelp, FileDown, Info, Lightbulb } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { analyzeMaintenance, getMaintenanceCase } from "@/server/services/tenancy";
import { db } from "@/server/db/client";
import { messageDraft } from "@/server/db/schema";
import { getEmailProvider } from "@/server/providers/email";
import { AppError } from "@/server/errors";
import { formatDate, titleCase } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/misc";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { FollowUpButton } from "@/components/forms/follow-up-button";
import { DraftEditor } from "@/components/investigation/draft-editor";
import { addMaintenanceEventAction } from "@/server/actions/tenancy";

const EVENTS = ["reported", "landlord_response", "repair_promised", "landlord_reports_complete", "tenant_confirmed_resolved", "tenant_reports_unresolved", "follow_up_sent", "photo_added", "note"];

export default async function MaintenanceCasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let d;
  try {
    d = await getMaintenanceCase(user.id, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const a = analyzeMaintenance(d.case, d.events);
  const drafts = await db.select().from(messageDraft).where(and(eq(messageDraft.ownerId, user.id), eq(messageDraft.maintenanceCaseId, id)));
  const email = getEmailProvider().info();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex gap-1.5">{d.case.isDemo ? <Badge tone="demo">DEMO</Badge> : null}<Badge tone="info">{titleCase(d.case.status)}</Badge><Badge tone={d.case.severity === "urgent" ? "bad" : "warn"}>{d.case.severity}</Badge></div>
          <h1 className="text-2xl font-semibold tracking-tight">{d.case.title}</h1>
          <p className="text-sm text-muted-foreground">{d.case.description}</p>
        </div>
        <div className="flex gap-2">
          <FollowUpButton caseId={id} />
          <Button asChild variant="outline"><Link href={`/api/reports/maintenance/${id}?format=pdf`}><FileDown /> Evidence timeline (PDF)</Link></Button>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Case analysis</CardTitle><CardDescription>Organized from what you recorded. No accusations, no assumptions.</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Callout tone="info" icon={<Lightbulb />} title="Suggested next step">{a.nextStep}</Callout>
              {a.flags.map((f, i) => <Callout key={i} tone={f.tone === "bad" ? "bad" : f.tone === "warn" ? "warn" : "neutral"} icon={f.tone === "info" ? <Info /> : <AlertTriangle />}>{f.text}</Callout>)}
              {a.conflicts.map((c, i) => <Callout key={i} tone="warn" icon={<AlertTriangle />} title="Conflicting promises">{c}</Callout>)}
              {a.missing.length ? <Callout tone="neutral" icon={<CircleHelp />} title="Missing information"><ul className="list-disc pl-4">{a.missing.map((m) => <li key={m}>{m}</li>)}</ul></Callout> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-border pl-5">
                {d.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[25px] top-1 size-2.5 rounded-full bg-teal-strong" />
                    <div className="text-xs text-muted-foreground">{formatDate(e.occurredOn)} · {titleCase(e.eventType)}{e.promisedDate ? ` · promised ${formatDate(e.promisedDate)}` : ""}</div>
                    <p className="text-sm">{e.description}</p>
                    {e.documentId ? <a href={`/api/files/doc/${e.documentId}`} target="_blank" className="text-xs text-blue hover:underline">Attachment</a> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          {drafts.length ? <div className="space-y-3"><h2 className="text-sm font-semibold">Follow-up drafts</h2>{drafts.map((dr) => <DraftEditor key={dr.id} d={dr} emailStatus={email.status} />)}</div> : null}
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>Record an update</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={addMaintenanceEventAction} mode="formdata" extra={{ caseId: id }} success="Update recorded" className="space-y-3">
              <Field label="What happened" htmlFor="et"><Select id="et" name="eventType">{EVENTS.map((e) => <option key={e} value={e}>{titleCase(e)}</option>)}</Select></Field>
              <Field label="Date" htmlFor="eo"><Input id="eo" name="occurredOn" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
              <Field label="Details" htmlFor="ed"><Textarea id="ed" name="description" rows={3} required /></Field>
              <Field label="Promised repair date (if any)" htmlFor="ep"><Input id="ep" name="promisedDate" type="date" /></Field>
              <Field label="Photo or document" htmlFor="ef"><Input id="ef" name="file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="h-auto py-2" /></Field>
              <SubmitButton variant="teal">Save update</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
