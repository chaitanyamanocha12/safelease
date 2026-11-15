import type { Metadata } from "next";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { FileDown } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { inspection, investigation } from "@/server/db/schema";
import { listLeaseReviews } from "@/server/services/leases";
import { listDeposits, listMaintenance, listTenancies } from "@/server/services/tenancy";
import { listDisputes } from "@/server/services/disputes";
import { myMemberships } from "@/server/services/organizations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Reports" };

function Row({ label, links }: { label: string; links: Array<[string, string]> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-0">
      <span>{label}</span>
      <span className="flex gap-3">{links.map(([l, h]) => <Link key={h} href={h} className="inline-flex items-center gap-1 text-blue hover:underline"><FileDown className="size-3.5" />{l}</Link>)}</span>
    </div>
  );
}

export default async function ReportsPage() {
  const user = await requireUser();
  const [invs, leases, ts, maint, deps, disputes, mems] = await Promise.all([db.select().from(investigation).where(eq(investigation.ownerId, user.id)), listLeaseReviews(user.id), listTenancies(user.id), listMaintenance(user.id), listDeposits(user.id), listDisputes(user.id), myMemberships(user.id)]);
  const insps = ts.length ? await db.select().from(inspection).where(inArray(inspection.tenancyId, ts.map((t) => t.id))) : [];
  const sections: Array<[string, React.ReactNode]> = [
    ["Rental investigations", invs.map((i) => <Row key={i.id} label={i.title} links={[["Investigation PDF", `/api/reports/investigation/${i.id}?format=pdf`], ["JSON", `/api/reports/investigation/${i.id}?format=json`], ["CSV", `/api/reports/investigation/${i.id}?format=csv`], ["Verification checklist", `/api/reports/verification/${i.id}`], ["Before-you-pay", `/api/reports/prepayment/${i.id}`]]} />)],
    ["Lease reviews", leases.map((l) => <Row key={l.id} label={l.title} links={[["PDF", `/api/reports/lease/${l.id}`]]} />)],
    ["Property comparison", <Row key="cmp" label="Current comparison" links={[["PDF", "/api/reports/comparison/me"]]} />],
    ["Inspections", insps.map((i) => <Row key={i.id} label={`${ts.find((t) => t.id === i.tenancyId)?.label} — ${i.kind.replace("_", "-")}`} links={[["PDF", `/api/reports/inspection/${i.id}`]]} />)],
    ["Maintenance", maint.map((m) => <Row key={m.id} label={m.title} links={[["Timeline PDF", `/api/reports/maintenance/${m.id}`]]} />)],
    ["Deposits", deps.map((d) => <Row key={d.id} label={ts.find((t) => t.id === d.tenancyId)?.label ?? "Deposit"} links={[["PDF", `/api/reports/deposit/${d.id}`]]} />)],
    ["Dispute evidence packages", disputes.map((d) => <Row key={d.id} label={d.title} links={[["PDF", `/api/reports/dispute/${d.id}`], ["JSON", `/api/reports/dispute/${d.id}?format=json`]]} />)],
    ...(mems.some((m) => m.membership.role !== "member") ? [["Organization aggregate", mems.filter((m) => m.membership.role !== "member").map((m) => <Row key={m.org.id} label={m.org.name} links={[["PDF", `/api/reports/organization/${m.org.id}`], ["CSV", `/api/reports/organization/${m.org.id}?format=csv`]]} />)] as [string, React.ReactNode]] : []),
  ];
  return (
    <>
      <PageHeader title="Reports" description="Download professional reports. Each one states its sources, what was verified, and its limitations." />
      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map(([t, body]) => (
          <Card key={t}><CardHeader><CardTitle>{t}</CardTitle></CardHeader><CardContent>{Array.isArray(body) && body.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet.</p> : body}</CardContent></Card>
        ))}
      </div>
    </>
  );
}
