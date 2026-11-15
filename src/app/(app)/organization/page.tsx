import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ShieldCheck } from "lucide-react";
import { orgContext } from "@/server/services/org-context";
import { listReferrals } from "@/server/services/organizations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout, PageHeader, Stat } from "@/components/ui/misc";
import { Field, Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { OrgNav } from "@/components/shell/org-nav";
import { acceptInviteAction, createOrgAction } from "@/server/actions/organization";

export const metadata: Metadata = { title: "Organization" };

export default async function OrgPage({ searchParams }: { searchParams: Promise<{ org?: string; invite?: string }> }) {
  const sp = await searchParams;
  const { user, mems, current } = await orgContext(sp.org);
  const refs = current ? await listReferrals(user.id, current.org.id) : [];
  return (
    <>
      <PageHeader eyebrow="Institutional portal" title={current ? current.org.name : "Organizations"} description="Help renters with consent-based case review. You only ever see cases a renter explicitly shares with your organization." />
      {sp.invite ? (
        <Card className="mb-6">
          <CardHeader><CardTitle>Accept invitation</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={acceptInviteAction} extra={{ token: sp.invite }} success="You've joined the organization" redirectTo="/organization?org={orgId}">
              <SubmitButton variant="teal">Accept and join</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
      {current ? (
        <>
          <OrgNav orgId={current.org.id} active="" isAdmin={current.membership.role === "org_admin"} orgs={mems.map((m) => m.org)} />
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Stat label="Your role" value={current.membership.role.replace("_", " ")} icon={<ShieldCheck />} />
            <Stat label="Open shared cases" value={refs.filter((r) => r.reviewStatus !== "closed").length} hint="Active consent only" />
            <Stat label="Minimum group size" value={current.org.minAggregateGroupSize} hint="Aggregate suppression threshold" />
          </div>
          <Callout tone="info" title="Privacy commitments">
            Membership does not grant access to members' cases. Each shared case requires an active, revocable consent grant; redacted shares hide names, addresses, contacts and payment names; files are never shared; every view is audit-logged.
          </Callout>
          <div className="mt-6 flex gap-2"><Link className="text-blue hover:underline" href={`/organization/cases?org=${current.org.id}`}>Go to case queue →</Link></div>
        </>
      ) : (
        <Callout tone="neutral" icon={<Building2 />} title="You're not an adviser or administrator in any organization">Create an organization below, or accept an invitation link from your organization's administrator.</Callout>
      )}
      <Card className="mt-6 max-w-xl">
        <CardHeader><CardTitle>Create an organization</CardTitle><CardDescription>You'll become its administrator.</CardDescription></CardHeader>
        <CardContent>
          <ActionForm action={createOrgAction} success="Organization created" redirectTo="/organization?org={id}" className="space-y-3">
            <Field label="Name" htmlFor="on"><Input id="on" name="name" required /></Field>
            <Field label="Type" htmlFor="ot"><Select id="ot" name="orgType"><option value="university">University</option><option value="student_union">Student union</option><option value="settlement">Newcomer settlement</option><option value="housing_nonprofit">Housing non-profit</option><option value="tenant_support">Tenant support</option><option value="other">Other</option></Select></Field>
            <SubmitButton>Create</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      {mems.length ? <div className="mt-4 flex flex-wrap gap-2 text-xs">{mems.map((m) => <Badge key={m.org.id} tone={m.org.isDemo ? "demo" : "outline"}>{m.org.name}</Badge>)}</div> : null}
    </>
  );
}
