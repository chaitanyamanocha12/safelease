import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Inbox } from "lucide-react";
import { orgContext } from "@/server/services/org-context";
import { getSharedCase, listReferrals } from "@/server/services/organizations";
import { AppError } from "@/server/errors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout, EmptyState, PageHeader } from "@/components/ui/misc";
import { Field, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { OrgNav } from "@/components/shell/org-nav";
import { EvidenceStatusBadge, SeverityBadge } from "@/components/status/status-badge";
import { addNoteAction, referralStatusAction } from "@/server/actions/organization";
import { formatDateTime, relativeTime, titleCase } from "@/lib/utils";

export const metadata: Metadata = { title: "Shared cases" };

export default async function OrgCases({ searchParams }: { searchParams: Promise<{ org?: string; referral?: string }> }) {
  const sp = await searchParams;
  const { user, mems, current } = await orgContext(sp.org);
  if (!current) redirect("/organization");
  const refs = await listReferrals(user.id, current.org.id);
  let shared: Awaited<ReturnType<typeof getSharedCase>> | null = null;
  let err: string | null = null;
  if (sp.referral) {
    try {
      shared = await getSharedCase(user.id, current.org.id, sp.referral);
    } catch (e) {
      err = e instanceof AppError ? e.message : "Unavailable";
    }
  }
  return (
    <>
      <PageHeader title={current.org.name} description="Cases renters have shared with your organization." />
      <OrgNav orgId={current.org.id} active="/cases" isAdmin={current.membership.role === "org_admin"} orgs={mems.map((m) => m.org)} />
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-2">
          {refs.length === 0 ? <EmptyState icon={<Inbox />} title="No shared cases" description="Cases appear here only after a renter shares them." /> : null}
          {refs.map((r) => (
            <Link key={r.id} href={`/organization/cases?org=${current.org.id}&referral=${r.id}`} className={`block rounded-lg border p-3 text-sm hover:bg-muted ${r.id === sp.referral ? "border-teal-strong bg-accent/40" : "border-border bg-card"}`}>
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{r.title}</span><Badge tone={r.reviewStatus === "new" ? "info" : r.reviewStatus === "closed" ? "outline" : "warn"}>{titleCase(r.reviewStatus)}</Badge></div>
              <div className="text-xs text-muted-foreground">{r.renter} · {r.city ?? ""} · {r.scope} · shared {relativeTime(r.grantedAt)}</div>
            </Link>
          ))}
        </div>
        <div>
          {err ? <Callout tone="bad">{err}</Callout> : null}
          {!shared && !err ? <p className="text-sm text-muted-foreground">Select a case to review.</p> : null}
          {shared ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap gap-1.5"><Badge tone={shared.scope === "redacted" ? "teal" : "outline"}>{shared.scope === "redacted" ? "Redacted view" : "Full view (no files)"}</Badge><Badge tone="outline">Renter: {shared.renter?.name}</Badge></div>
                  <CardTitle className="mt-2">{shared.case.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {shared.message ? <Callout tone="info" title="Message from the renter">{shared.message}</Callout> : null}
                  {shared.case.summary ? <p>{shared.case.summary}</p> : null}
                  <div className="grid gap-2 sm:grid-cols-2">{shared.facts.map((f, i) => <div key={i} className="rounded-md border border-border p-2"><div className="text-xs text-muted-foreground">{titleCase(f.type)}</div><div className="font-medium">{f.value}</div></div>)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Findings</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {shared.findings.map((f) => (
                    <div key={f.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="mb-1 flex flex-wrap gap-1"><SeverityBadge severity={f.severity} /><EvidenceStatusBadge status={f.label} /></div>
                      <div className="font-medium">{f.title}</div>
                      <p className="text-muted-foreground">{f.explanation}</p>
                      {f.citationUrl ? <a className="inline-flex items-center gap-1 text-xs text-blue hover:underline" href={f.citationUrl} target="_blank" rel="noopener noreferrer">{f.citationLabel} <ExternalLink className="size-3" /></a> : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Adviser workflow</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <ActionForm action={referralStatusAction} extra={{ orgId: current.org.id, referralId: shared.referral.id }} success="Status updated" reset={false} className="flex flex-wrap items-end gap-2">
                    <Field label="Review status" htmlFor="rs"><Select id="rs" name="status" defaultValue={shared.referral.reviewStatus}><option value="new">New</option><option value="in_review">In review</option><option value="awaiting_renter">Awaiting renter</option><option value="closed">Closed</option></Select></Field>
                    <SubmitButton size="sm">Update</SubmitButton>
                  </ActionForm>
                  <ActionForm action={addNoteAction} extra={{ orgId: current.org.id, referralId: shared.referral.id }} booleans={["visibleToRenter"]} success="Note added" className="space-y-2">
                    <Field label="Add a note" htmlFor="nb"><Textarea id="nb" name="body" rows={3} required /></Field>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visibleToRenter" defaultChecked /> Visible to the renter</label>
                    <SubmitButton size="sm" variant="teal">Add note</SubmitButton>
                  </ActionForm>
                  <ul className="space-y-2 text-sm">{shared.notes.map((n) => <li key={n.id} className="rounded-md bg-muted p-2"><div className="text-xs text-muted-foreground">{n.author} · {formatDateTime(n.createdAt)} · {n.visibleToRenter ? "visible to renter" : "internal"}</div>{n.body}</li>)}</ul>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
