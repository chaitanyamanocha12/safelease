import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { orgContext } from "@/server/services/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { OrgNav } from "@/components/shell/org-nav";
import { orgSettingsAction } from "@/server/actions/organization";

export const metadata: Metadata = { title: "Organization settings" };

export default async function OrgSettings({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const sp = await searchParams;
  const { mems, current } = await orgContext(sp.org);
  if (!current || current.membership.role !== "org_admin") redirect("/organization");
  const o = current.org;
  return (
    <>
      <PageHeader title={o.name} />
      <OrgNav orgId={o.id} active="/settings" isAdmin orgs={mems.map((m) => m.org)} />
      <Card className="max-w-xl">
        <CardHeader><CardTitle>Branding & privacy</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={orgSettingsAction} extra={{ orgId: o.id }} reset={false} success="Settings saved" className="space-y-3">
            <Field label="Name" htmlFor="sn"><Input id="sn" name="name" defaultValue={o.name} /></Field>
            <Field label="Display name" htmlFor="sd"><Input id="sd" name="displayName" defaultValue={o.displayName ?? ""} /></Field>
            <Field label="Brand colour" htmlFor="sb"><Input id="sb" name="brandColor" type="color" defaultValue={o.brandColor} className="h-10 w-20 p-1" /></Field>
            <Field label="Contact email" htmlFor="se"><Input id="se" name="contactEmail" type="email" defaultValue={o.contactEmail ?? ""} /></Field>
            <Field label="Minimum aggregate group size" htmlFor="sm" hint="Counts below this are suppressed in analytics (minimum 3)."><Input id="sm" name="minAggregateGroupSize" type="number" min={3} max={50} defaultValue={o.minAggregateGroupSize} /></Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </>
  );
}
