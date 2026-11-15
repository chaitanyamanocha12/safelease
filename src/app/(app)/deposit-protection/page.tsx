import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FileDown, PiggyBank } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { depositStatusSummary, getDeposit, listDeposits, listTenancies } from "@/server/services/tenancy";
import { listDrafts } from "@/server/services/communications";
import { getEmailProvider } from "@/server/providers/email";
import { formatCents } from "@/lib/money";
import { formatDate, titleCase } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { SimpleActionButton } from "@/components/forms/simple-action-button";
import { DraftEditor } from "@/components/investigation/draft-editor";
import { addDepositEventAction, createDepositAction, createDisputeAction, depositReturnDraftAction } from "@/server/actions/tenancy";
import { RULE_BY_KEY, SOURCE_BY_KEY } from "@/server/legal/catalog";

export const metadata: Metadata = { title: "Deposit protection" };
const EVENTS = ["receipt_uploaded", "tenancy_ended", "return_requested", "amount_returned", "deduction_claimed", "deduction_disputed", "landlord_claim_received", "tenant_application_filed", "note"];

export default async function DepositPage() {
  const user = await requireUser();
  const [deposits, ts, drafts] = await Promise.all([listDeposits(user.id), listTenancies(user.id), listDrafts(user.id)]);
  const rule = RULE_BY_KEY.get("NS-DEPOSIT-RETURN")!;
  const full = await Promise.all(deposits.map(async (d) => ({ ...(await getDeposit(user.id, d.id)) })));
  const email = getEmailProvider().info();
  return (
    <>
      <PageHeader title="Deposit protection" description="Track what you paid, what you're owed and the Nova Scotia timeline for return." />
      <Callout tone="info" className="mb-6" title={rule.title}>
        {rule.summary}{" "}
        <a className="inline-flex items-center gap-1 text-blue underline" href={SOURCE_BY_KEY.get(rule.sourceKey)!.url} target="_blank" rel="noopener noreferrer">{rule.citation} <ExternalLink className="size-3" /></a> ·{" "}
        <a className="text-blue underline" href="https://www.novascotia.ca/sites/default/files/documents/1-4300/residential-tenancies-program-security-deposit-claims-en.pdf" target="_blank" rel="noopener noreferrer">Security Deposit Claims guide</a> ·{" "}
        <a className="text-blue underline" href="https://www.novascotia.ca/residential-tenancy-forms" target="_blank" rel="noopener noreferrer">Official forms (Form S)</a>
      </Callout>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {full.length === 0 ? <EmptyState icon={<PiggyBank />} title="No deposits tracked" /> : null}
          {full.map(({ deposit: d, events }) => {
            const s = depositStatusSummary(d, events);
            const t = ts.find((x) => x.id === d.tenancyId);
            return (
              <Card key={d.id}>
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle>{t?.label ?? "Security deposit"}</CardTitle>
                    <CardDescription>{formatCents(d.amountCents)} paid {d.paidOn ? formatDate(d.paidOn) : ""}{d.paidTo ? ` to ${d.paidTo}` : ""}</CardDescription>
                  </div>
                  <div className="flex gap-1">{d.isDemo ? <Badge tone="demo">DEMO</Badge> : null}<Badge tone={d.status === "fully_returned" ? "ok" : d.status === "disputed" ? "warn" : "info"}>{titleCase(d.status)}</Badge></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Stat label="Paid" value={formatCents(d.amountCents)} />
                    <Stat label="Returned" value={formatCents(d.amountReturnedCents ?? 0)} />
                    <Stat label="Outstanding" value={formatCents(s.outstandingCents)} />
                    <Stat label="Disputed" value={formatCents(s.disputedCents)} />
                  </div>
                  <Callout tone={s.rule.outcome === "potential_issue" ? "warn" : "neutral"} title={s.deadline ? `Return or claim deadline: ${formatDate(s.deadline)}` : "Add the tenancy end date to calculate the deadline"}>{s.rule.explanation}</Callout>
                  {s.exceededLimit ? <Callout tone="bad">This deposit was above the half-month maximum ({formatCents(s.exceededLimit.maxAllowed)}).</Callout> : null}
                  <ol className="space-y-1.5 border-l border-border pl-4 text-sm">
                    {events.map((e) => <li key={e.id}><span className="text-xs text-muted-foreground">{formatDate(e.occurredOn)} · {titleCase(e.eventType)}</span><br />{e.description}{e.amountCents ? ` (${formatCents(e.amountCents)})` : ""}{e.documentId ? <> · <a className="text-blue underline" href={`/api/files/doc/${e.documentId}`} target="_blank">file</a></> : null}</li>)}
                  </ol>
                  <details className="rounded-md border border-border p-3">
                    <summary className="cursor-pointer text-sm font-medium">Record a deposit event</summary>
                    <ActionForm action={addDepositEventAction} mode="formdata" extra={{ depositId: d.id }} success="Event recorded" className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Event" htmlFor={`de-${d.id}`}><Select id={`de-${d.id}`} name="eventType">{EVENTS.map((e) => <option key={e} value={e}>{titleCase(e)}</option>)}</Select></Field>
                      <Field label="Date" htmlFor={`dd-${d.id}`}><Input id={`dd-${d.id}`} name="occurredOn" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
                      <Field label="Amount ($, if any)" htmlFor={`da-${d.id}`}><Input id={`da-${d.id}`} name="amount" inputMode="decimal" /></Field>
                      <Field label="Receipt / document" htmlFor={`df-${d.id}`}><Input id={`df-${d.id}`} name="file" type="file" className="h-auto py-2" accept="image/png,image/jpeg,image/webp,application/pdf" /></Field>
                      <Field label="Description" htmlFor={`dx-${d.id}`} className="sm:col-span-2"><Textarea id={`dx-${d.id}`} name="description" rows={2} required /></Field>
                      <SubmitButton size="sm">Save event</SubmitButton>
                    </ActionForm>
                  </details>
                  <div className="flex flex-wrap gap-2">
                    <SimpleActionButton action={depositReturnDraftAction} args={{ depositId: d.id }} variant="outline" size="sm" success="Draft created below — not sent">Draft return request</SimpleActionButton>
                    <SimpleActionButton action={createDisputeAction} args={{ disputeType: "deposit", title: `${t?.label ?? "Deposit"} — dispute`, depositId: d.id, tenancyId: d.tenancyId ?? undefined }} variant="outline" size="sm" success="Evidence package created" redirectTo="/disputes">Build dispute package</SimpleActionButton>
                    <Button asChild size="sm" variant="ghost"><Link href={`/api/reports/deposit/${d.id}?format=pdf`}><FileDown /> Deposit report</Link></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {drafts.filter((x) => x.purpose === "deposit_return").map((dr) => <DraftEditor key={dr.id} d={dr} emailStatus={email.status} />)}
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>Track a deposit</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={createDepositAction} success="Deposit tracked" className="space-y-3">
              <Field label="Amount paid ($)" htmlFor="da"><Input id="da" name="amount" required inputMode="decimal" /></Field>
              <Field label="Monthly rent ($)" htmlFor="dr" hint="Used to check the half-month limit."><Input id="dr" name="rent" inputMode="decimal" /></Field>
              <Field label="Tenancy" htmlFor="dt"><Select id="dt" name="tenancyId"><option value="">None</option>{ts.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
              <Field label="Paid on" htmlFor="dp"><Input id="dp" name="paidOn" type="date" /></Field>
              <Field label="Paid to" htmlFor="dpt"><Input id="dpt" name="paidTo" /></Field>
              <Field label="Method" htmlFor="dm"><Input id="dm" name="paymentMethod" placeholder="e-transfer, cheque…" /></Field>
              <SubmitButton variant="teal">Track deposit</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
