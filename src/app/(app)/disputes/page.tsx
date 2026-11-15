import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Scale } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { listDisputes } from "@/server/services/disputes";
import { listDeposits, listMaintenance, listTenancies } from "@/server/services/tenancy";
import { db } from "@/server/db/client";
import { investigation } from "@/server/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout, EmptyState, PageHeader } from "@/components/ui/misc";
import { Field, Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { createDisputeAction } from "@/server/actions/tenancy";
import { relativeTime, titleCase } from "@/lib/utils";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Disputes" };

export default async function DisputesPage() {
  const user = await requireUser();
  const [items, ts, deps, maint, invs] = await Promise.all([listDisputes(user.id), listTenancies(user.id), listDeposits(user.id), listMaintenance(user.id), db.select({ id: investigation.id, title: investigation.title }).from(investigation).where(eq(investigation.ownerId, user.id))]);
  return (
    <>
      <PageHeader title="Dispute evidence builder" description="Assemble your records into an organized package you can review, correct and bring to an adviser or the Residential Tenancies Program." />
      <Callout tone="neutral" className="mb-6">SafeLease never files a claim for you and can't predict outcomes. Official applications are made through the Residential Tenancies Program (e.g. Form J or Form S).</Callout>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          {items.length === 0 ? <EmptyState icon={<Scale />} title="No evidence packages yet" /> : null}
          {items.map((d) => (
            <Card key={d.id}>
              <Link href={`/disputes/${d.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div><div className="font-medium">{d.title}</div><div className="text-xs text-muted-foreground">{titleCase(d.disputeType)} · updated {relativeTime(d.updatedAt)}</div></div>
                <div className="flex gap-1">{d.isDemo ? <Badge tone="demo">DEMO</Badge> : null}<Badge tone="outline">{titleCase(d.status)}</Badge></div>
              </Link>
            </Card>
          ))}
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>New evidence package</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={createDisputeAction} success="Package generated" redirectTo="/disputes/{id}" className="space-y-3">
              <Field label="Type" htmlFor="dt"><Select id="dt" name="disputeType">{["deposit", "maintenance", "unexpected_fee", "lease_discrepancy", "rent_increase", "misrepresentation"].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
              <Field label="Title" htmlFor="dti"><Input id="dti" name="title" required /></Field>
              <Field label="Tenancy" htmlFor="dte"><Select id="dte" name="tenancyId"><option value="">None</option>{ts.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
              <Field label="Deposit record" htmlFor="ddp"><Select id="ddp" name="depositId"><option value="">None</option>{deps.map((d) => <option key={d.id} value={d.id}>{formatCents(d.amountCents)} deposit</option>)}</Select></Field>
              <Field label="Maintenance case" htmlFor="dmc"><Select id="dmc" name="maintenanceCaseId"><option value="">None</option>{maint.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select></Field>
              <Field label="Investigation" htmlFor="din"><Select id="din" name="investigationId"><option value="">None</option>{invs.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</Select></Field>
              <SubmitButton variant="teal">Generate package</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
