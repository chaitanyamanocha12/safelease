import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileDown } from "lucide-react";
import { orgContext } from "@/server/services/org-context";
import { organizationAggregates } from "@/server/services/organizations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Callout, PageHeader, Stat } from "@/components/ui/misc";
import { BarList } from "@/components/charts/bar-list";
import { OrgNav } from "@/components/shell/org-nav";
import { titleCase } from "@/lib/utils";

export const metadata: Metadata = { title: "Organization analytics" };

export default async function OrgAnalytics({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const sp = await searchParams;
  const { user, mems, current } = await orgContext(sp.org);
  if (!current) redirect("/organization");
  const a = await organizationAggregates(user.id, current.org.id);
  return (
    <>
      <PageHeader title={current.org.name} description="Aggregate patterns across consented cases only." actions={<><Button asChild variant="outline"><a href={`/api/reports/organization/${current.org.id}`}><FileDown /> PDF</a></Button><Button asChild variant="outline"><a href={`/api/reports/organization/${current.org.id}?format=csv`}>CSV</a></Button></>} />
      <OrgNav orgId={current.org.id} active="/analytics" isAdmin={current.membership.role === "org_admin"} orgs={mems.map((m) => m.org)} />
      <Callout tone="info" className="mb-6">Any count below {a.minGroupSize} is shown as “&lt;{a.minGroupSize}” to prevent identifying individuals.{a.belowThreshold ? " Too few cases have been shared for most figures to be shown." : ""}</Callout>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Cases shared (all time)" value={String(a.totalShared)} />
        <Stat label="Currently shared" value={String(a.activeShared)} />
        <Stat label="Sharing revoked" value={String(a.revoked)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Common themes</CardTitle></CardHeader><CardContent><BarList title="Common themes in shared cases" data={a.themes.map((t) => ({ label: t.theme, value: t.count }))} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Referral status</CardTitle></CardHeader><CardContent><BarList title="Referrals by status" data={a.byStatus.map((s) => ({ label: titleCase(s.status), value: s.count }))} /></CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><CardTitle>Cases shared by month</CardTitle></CardHeader><CardContent><BarList title="Cases shared by month" data={a.byMonth.map((m) => ({ label: m.month, value: m.count }))} /></CardContent></Card>
      </div>
    </>
  );
}
