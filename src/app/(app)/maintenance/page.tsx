import type { Metadata } from "next";
import Link from "next/link";
import { Wrench } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { listMaintenance, listTenancies } from "@/server/services/tenancy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { createMaintenanceAction } from "@/server/actions/tenancy";
import { formatDate, titleCase } from "@/lib/utils";

export const metadata: Metadata = { title: "Maintenance" };

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ tenancy?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [cases, ts] = await Promise.all([listMaintenance(user.id), listTenancies(user.id)]);
  const list = sp.tenancy ? cases.filter((c) => c.tenancyId === sp.tenancy) : cases;
  return (
    <>
      <PageHeader title="Maintenance & repairs" description="Log issues, landlord responses and promised dates. A landlord's statement that a repair is done isn't treated as confirmation until you verify it." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          {list.length === 0 ? <EmptyState icon={<Wrench />} title="No maintenance issues logged" /> : null}
          {list.map((c) => (
            <Card key={c.id}>
              <Link href={`/maintenance/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-muted-foreground">{c.location ?? "Location not set"} · discovered {formatDate(c.discoveredOn)}{c.promisedBy ? ` · promised by ${formatDate(c.promisedBy)}` : ""}</div>
                </div>
                <div className="flex gap-1">{c.isDemo ? <Badge tone="demo">DEMO</Badge> : null}<Badge tone={c.severity === "urgent" ? "bad" : c.severity === "medium" ? "warn" : "neutral"}>{c.severity}</Badge><Badge tone={c.status === "tenant_confirmed_resolved" ? "ok" : "info"}>{titleCase(c.status)}</Badge></div>
              </Link>
            </Card>
          ))}
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>Log an issue</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={createMaintenanceAction} success="Issue logged" redirectTo="/maintenance/{id}" className="space-y-3">
              <Field label="What's wrong?" htmlFor="mt"><Input id="mt" name="title" required /></Field>
              <Field label="Details" htmlFor="md"><Textarea id="md" name="description" required rows={3} /></Field>
              <Field label="Tenancy" htmlFor="mtn"><Select id="mtn" name="tenancyId" defaultValue={sp.tenancy ?? ""}><option value="">None</option>{ts.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Location" htmlFor="ml"><Input id="ml" name="location" placeholder="Bathroom" /></Field>
                <Field label="Severity" htmlFor="ms"><Select id="ms" name="severity" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="urgent">Urgent</option></Select></Field>
              </div>
              <Field label="Discovered on" htmlFor="mdo"><Input id="mdo" name="discoveredOn" type="date" /></Field>
              <SubmitButton variant="teal">Log issue</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
