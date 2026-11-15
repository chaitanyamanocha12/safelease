import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { AlertOctagon, Bookmark, CalendarClock, ClipboardCheck, Compass, FileText, Plus, Search, Wrench } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { finding, investigation, maintenanceCase, savedProperty } from "@/server/db/schema";
import { listInvestigations } from "@/server/services/investigations";
import { listNotifications } from "@/server/services/notifications";
import { listDeposits, depositStatusSummary, getDeposit } from "@/server/services/tenancy";
import { getProfile } from "@/server/services/profile";
import { aiModeLabel } from "@/server/providers/registry";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { BarList } from "@/components/charts/bar-list";
import { formatDate, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const CAT = { contradiction: "Contradictions", legal: "Tenancy rule concerns", warning: "Warning signs", image: "Image matches", verification_gap: "Not yet verified", unknown: "Unknown facts" } as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const profile = await getProfile(user.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding");
  const [cases, notes, savedCount, deposits, maint] = await Promise.all([
    listInvestigations(user.id, { pageSize: 5 }),
    listNotifications(user.id, { limit: 5 }),
    db.select({ n: sql<number>`count(*)` }).from(savedProperty).where(eq(savedProperty.userId, user.id)),
    listDeposits(user.id),
    db.select().from(maintenanceCase).where(and(eq(maintenanceCase.ownerId, user.id))),
  ]);
  const invIds = (await db.select({ id: investigation.id }).from(investigation).where(eq(investigation.ownerId, user.id))).map((r) => r.id);
  const byCat = invIds.length
    ? await db.select({ category: finding.category, n: sql<number>`count(*)` }).from(finding).where(and(inArray(finding.investigationId, invIds), eq(finding.lifecycle, "active"))).groupBy(finding.category)
    : [];
  const serious = invIds.length ? Number((await db.select({ n: sql<number>`count(*)` }).from(finding).where(and(inArray(finding.investigationId, invIds), eq(finding.lifecycle, "active"), eq(finding.severity, "serious"))))[0]?.n ?? 0) : 0;
  const today = new Date().toISOString().slice(0, 10);
  const deadlines: Array<{ date: string; label: string; href: string }> = [];
  for (const d of deposits) {
    const { events } = await getDeposit(user.id, d.id);
    const s = depositStatusSummary(d, events, today);
    if (s.deadline && d.status !== "fully_returned") deadlines.push({ date: s.deadline, label: `Deposit return/claim deadline (${formatDate(s.deadline)})`, href: "/deposit-protection" });
  }
  for (const m of maint.filter((x) => x.promisedBy && x.status !== "tenant_confirmed_resolved")) deadlines.push({ date: m.promisedBy!, label: `Promised repair: ${m.title}`, href: `/maintenance/${m.id}` });
  deadlines.sort((a, b) => a.date.localeCompare(b.date));
  const recentMonth = invIds.length ? Number((await db.select({ n: sql<number>`count(*)` }).from(investigation).where(and(eq(investigation.ownerId, user.id), gte(investigation.createdAt, new Date(Date.now() - 30 * 86400_000)))))[0]?.n ?? 0) : 0;
  const ai = aiModeLabel();

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description="Investigate before you pay. Here's where your cases stand."
        actions={<Button asChild variant="teal"><Link href="/investigations/new"><Plus /> Investigate a rental</Link></Button>}
      />
      {sp.denied ? <p role="alert" className="mb-4 rounded-md border border-warn/30 bg-warn-bg p-3 text-sm">You don't have access to that area.</p> : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Investigations" value={cases.total} hint={`${recentMonth} started in the last 30 days`} icon={<Search />} />
        <Stat label="Serious concerns open" value={serious} hint="Across all active cases" icon={<AlertOctagon />} />
        <Stat label="Saved properties" value={Number(savedCount[0]?.n ?? 0)} hint="Shortlist & comparison" icon={<Bookmark />} />
        <Stat label="Upcoming dates" value={deadlines.filter((d) => d.date >= today).length} hint="Deposit and repair dates" icon={<CalendarClock />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Recent investigations</CardTitle>
                <CardDescription>{ai.label}</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm"><Link href="/investigations">View all</Link></Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {cases.items.length === 0 ? <EmptyState icon={<Search />} title="No investigations yet" description="Paste a listing or upload a screenshot to get started." /> : null}
              {cases.items.map((c) => (
                <Link key={c.id} href={`/investigations/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 hover:bg-muted">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.title}</div>
                    <div className="text-xs text-muted-foreground">{c.city} · updated {relativeTime(c.updatedAt)}</div>
                  </div>
                  <div className="flex gap-1">
                    {c.isDemo ? <Badge tone="demo">DEMO</Badge> : null}
                    {c.serious ? <Badge tone="bad">{c.serious} serious</Badge> : null}
                    {c.caution ? <Badge tone="warn">{c.caution} to clarify</Badge> : null}
                    {!c.serious && !c.caution ? <Badge tone="neutral">Unverified</Badge> : null}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Open findings by type</CardTitle>
              <CardDescription>Active findings across your investigations.</CardDescription>
            </CardHeader>
            <CardContent>
              <BarList title="Open findings by type" data={(Object.keys(CAT) as Array<keyof typeof CAT>).map((k) => ({ label: CAT[k], value: Number(byCat.find((b) => b.category === k)?.n ?? 0) }))} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {[
                { href: "/investigations/new", label: "Investigate a listing", icon: Search },
                { href: "/lease-review", label: "Review a lease", icon: FileText },
                { href: "/discover", label: "Discover rentals", icon: Compass },
                { href: "/move-in", label: "Move-in inspection", icon: ClipboardCheck },
                { href: "/maintenance", label: "Log a repair", icon: Wrench },
                { href: "/saved", label: "Saved properties", icon: Bookmark },
              ].map((a) => (
                <Link key={a.href} href={a.href} className="flex items-center gap-2 rounded-md border border-border p-3 text-sm font-medium hover:bg-muted">
                  <a.icon className="size-4 text-teal" aria-hidden /> {a.label}
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Upcoming dates</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {deadlines.length === 0 ? <p className="text-muted-foreground">No dates tracked yet.</p> : null}
              {deadlines.slice(0, 5).map((d, i) => (
                <Link key={i} href={d.href} className="flex items-center justify-between gap-2 rounded-md p-2 hover:bg-muted">
                  <span>{d.label}</span>
                  <Badge tone={d.date < today ? "warn" : "info"}>{d.date < today ? "Passed" : formatDate(d.date)}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Notifications</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link href="/notifications">All</Link></Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {notes.length === 0 ? <p className="text-muted-foreground">You're all caught up.</p> : null}
              {notes.map((n) => (
                <Link key={n.id} href={n.link ?? "/notifications"} className="block rounded-md p-2 hover:bg-muted">
                  <div className={n.readAt ? "" : "font-medium"}>{n.title}</div>
                  <div className="text-xs text-muted-foreground">{relativeTime(n.createdAt)}</div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
