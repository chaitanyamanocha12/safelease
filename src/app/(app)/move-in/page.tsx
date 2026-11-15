import type { Metadata } from "next";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { ClipboardCheck, ExternalLink } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { listTenancies } from "@/server/services/tenancy";
import { db } from "@/server/db/client";
import { inspection } from "@/server/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState, PageHeader } from "@/components/ui/misc";
import { Field, Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { createInspectionAction, createTenancyAction } from "@/server/actions/tenancy";
import { formatCents } from "@/lib/money";
import { formatDate, titleCase } from "@/lib/utils";

export const metadata: Metadata = { title: "Move-in" };

export default async function MoveInPage() {
  const user = await requireUser();
  const ts = await listTenancies(user.id);
  const insps = ts.length ? await db.select().from(inspection).where(inArray(inspection.tenancyId, ts.map((t) => t.id))) : [];
  return (
    <>
      <PageHeader title="Move-in & move-out" description="Document the unit's condition room by room with dated photos. Keep it for repairs and your deposit." />
      <Callout tone="info" className="mb-6" title="Use the official Rental Unit Condition Report too">
        SafeLease organizes your evidence but isn't the official signed form. Both parties should complete and sign Nova Scotia's report; if the landlord won't, complete it with a witness.{" "}
        <a className="inline-flex items-center gap-1 font-medium text-blue underline" href="https://www.novascotia.ca/rental-unit-condition-report-form" target="_blank" rel="noopener noreferrer">Official form <ExternalLink className="size-3" /></a>
      </Callout>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          {ts.length === 0 ? <EmptyState icon={<ClipboardCheck />} title="No tenancies yet" description="Create a tenancy record to start a move-in inspection." /> : null}
          {ts.map((t) => {
            const list = insps.filter((i) => i.tenancyId === t.id);
            return (
              <Card key={t.id}>
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle>{t.label}</CardTitle>
                    <CardDescription>{t.address ?? "Address not set"} · {titleCase(t.leaseType)} · {t.monthlyRentCents ? `${formatCents(t.monthlyRentCents)}/mo` : "rent not set"}</CardDescription>
                  </div>
                  <div className="flex gap-1">{t.isDemo ? <Badge tone="demo">DEMO</Badge> : null}<Badge tone="outline">{titleCase(t.status)}</Badge></div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {list.map((i) => (
                    <Link key={i.id} href={`/move-in/${i.id}`} className="flex items-center justify-between rounded-md border border-border p-3 text-sm hover:bg-muted">
                      <span className="font-medium">{i.kind === "move_in" ? "Move-in inspection" : "Move-out inspection"} · {formatDate(i.inspectedOn)}</span>
                      <Badge tone={i.status === "completed" ? "ok" : "info"}>{i.status}</Badge>
                    </Link>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!list.some((i) => i.kind === "move_out") ? (
                      <ActionForm action={createInspectionAction} extra={{ tenancyId: t.id, kind: "move_out" }} success="Move-out inspection created">
                        <SubmitButton size="sm" variant="outline">Start move-out inspection</SubmitButton>
                      </ActionForm>
                    ) : null}
                    <Button asChild size="sm" variant="ghost"><Link href={`/maintenance?tenancy=${t.id}`}>Maintenance</Link></Button>
                    <Button asChild size="sm" variant="ghost"><Link href={`/deposit-protection?tenancy=${t.id}`}>Deposit</Link></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>New tenancy</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={createTenancyAction} success="Tenancy created" redirectTo="/move-in/{inspectionId}" className="space-y-3">
              <Field label="Name" htmlFor="tl"><Input id="tl" name="label" required placeholder="e.g. Agricola St apartment" /></Field>
              <Field label="Address" htmlFor="ta"><Input id="ta" name="address" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Landlord" htmlFor="tn"><Input id="tn" name="landlordName" /></Field>
                <Field label="Landlord contact" htmlFor="tc"><Input id="tc" name="landlordContact" /></Field>
                <Field label="Lease type" htmlFor="tt"><Select id="tt" name="leaseType" defaultValue="year_to_year"><option value="year_to_year">Year-to-year</option><option value="month_to_month">Month-to-month</option><option value="week_to_week">Week-to-week</option><option value="fixed_term">Fixed-term</option><option value="unknown">Not sure</option></Select></Field>
                <Field label="Monthly rent ($)" htmlFor="tr"><Input id="tr" name="rent" inputMode="decimal" /></Field>
                <Field label="Start date" htmlFor="tsd"><Input id="tsd" name="startDate" type="date" /></Field>
                <Field label="Move-in date" htmlFor="tmd"><Input id="tmd" name="moveInDate" type="date" /></Field>
              </div>
              <Field label="Status" htmlFor="tst"><Select id="tst" name="status" defaultValue="upcoming"><option value="upcoming">Upcoming</option><option value="active">Active</option><option value="ended">Ended</option></Select></Field>
              <SubmitButton variant="teal">Create & start move-in inspection</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
