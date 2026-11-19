import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { ArrowRight, Bookmark, ClipboardCheck, Compass, FileText, Plus, Search, Wrench } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { HalifaxHouses, Stars } from "@/components/marketing/halifax-scene";
import { BarList } from "@/components/charts/bar-list";
import CountUp from "@/components/reactbits/CountUp/CountUp";
import { daysAgo, formatDate, relativeTime, todayIso } from "@/lib/utils";

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
  const today = todayIso();
  const deadlines: Array<{ date: string; label: string; href: string }> = [];
  for (const d of deposits) {
    const { events } = await getDeposit(user.id, d.id);
    const s = depositStatusSummary(d, events, today);
    if (s.deadline && d.status !== "fully_returned") deadlines.push({ date: s.deadline, label: `Deposit return/claim deadline (${formatDate(s.deadline)})`, href: "/deposit-protection" });
  }
  for (const m of maint.filter((x) => x.promisedBy && x.status !== "tenant_confirmed_resolved")) deadlines.push({ date: m.promisedBy!, label: `Promised repair: ${m.title}`, href: `/maintenance/${m.id}` });
  deadlines.sort((a, b) => a.date.localeCompare(b.date));
  const recentMonth = invIds.length ? Number((await db.select({ n: sql<number>`count(*)` }).from(investigation).where(and(eq(investigation.ownerId, user.id), gte(investigation.createdAt, daysAgo(30)))))[0]?.n ?? 0) : 0;
  const ai = aiModeLabel();

  const first = user.name.split(" ")[0];
  const upcoming = deadlines.filter((d) => d.date >= today).length;
  const STATS = [
    { label: "Investigations", value: cases.total, hint: `${recentMonth} this month` },
    { label: "Serious concerns", value: serious, hint: "open now", alert: serious > 0 },
    { label: "Saved homes", value: Number(savedCount[0]?.n ?? 0), hint: "on your shortlist" },
    { label: "Upcoming dates", value: upcoming, hint: "deposit & repairs" },
  ];
  const ACTIONS = [
    { href: "/investigations/new", label: "Investigate", icon: Search, tint: "from-teal-400 to-emerald-500" },
    { href: "/lease-review", label: "Review lease", icon: FileText, tint: "from-sky-400 to-blue-600" },
    { href: "/discover", label: "Discover", icon: Compass, tint: "from-violet-400 to-indigo-600" },
    { href: "/move-in", label: "Move-in", icon: ClipboardCheck, tint: "from-amber-300 to-orange-500" },
    { href: "/maintenance", label: "Repairs", icon: Wrench, tint: "from-rose-400 to-pink-600" },
    { href: "/saved", label: "Saved", icon: Bookmark, tint: "from-lime-300 to-green-600" },
  ];

  return (
    <>
      {sp.denied ? <p role="alert" className="mb-4 rounded-md border border-warn/30 bg-warn-bg p-3 text-sm">You don't have access to that area.</p> : null}

      {/* Welcome banner — same night-Halifax language as the landing page */}
      <section className="relative isolate mb-8 overflow-hidden rounded-[1.75rem] bg-[#060b14] text-white shadow-elevated">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_70%_90%_at_85%_0%,rgb(20_184_166/0.35),transparent_60%),radial-gradient(ellipse_60%_80%_at_10%_0%,rgb(99_102_241/0.25),transparent_60%)]" />
        <Stars count={40} />
        <div aria-hidden className="pointer-events-none absolute -bottom-2 right-0 w-[640px] max-w-[80%] opacity-35 [mask-image:linear-gradient(to_left,black_40%,transparent)]">
          <HalifaxHouses />
        </div>
        <div className="relative px-6 pb-6 pt-8 sm:px-10 sm:pt-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-teal-strong">
            {daysAgo(0).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <h1 className="mt-3 font-display text-5xl leading-none tracking-tight sm:text-6xl">Welcome back, {first}</h1>
          <p className="mt-3 max-w-md text-white/60">
            {serious > 0 ? <>You have <span className="font-semibold text-white">{serious} serious {serious === 1 ? "concern" : "concerns"}</span> to look at before paying anyone.</> : "Nothing serious open right now. Investigate before you pay."}
          </p>
          <Button asChild variant="teal" className="mt-6 h-10 rounded-full px-5">
            <Link href="/investigations/new"><Plus /> Investigate a rental</Link>
          </Button>
          <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 lg:grid-cols-4">
            {STATS.map((x) => (
              <div key={x.label} className="bg-[#0a1220]/80 px-5 py-4 backdrop-blur">
                <dt className="text-xs text-white/55">{x.label}</dt>
                <dd className={`mt-1 font-display text-4xl tracking-tight ${x.alert ? "text-[#fca5a5]" : ""}`}>
                  <CountUp to={x.value} duration={1.2} trigger="load" />
                </dd>
                <dd className="text-[11px] text-white/40">{x.hint}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Quick actions */}
      <nav aria-label="Quick actions" className="mb-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={a.href} className="group flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-card p-4 text-center text-xs font-medium shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated">
            <span className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${a.tint} text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_6px_16px_-6px_rgb(0_0_0/0.4)] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}>
              <a.icon className="size-5" aria-hidden />
            </span>
            {a.label}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card className="rounded-2xl">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Recent investigations</CardTitle>
                <p className="text-xs text-muted-foreground">{ai.label}</p>
              </div>
              <Button asChild variant="ghost" size="sm"><Link href="/investigations">View all</Link></Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {cases.items.length === 0 ? <EmptyState icon={<Search />} title="No investigations yet" description="Paste a listing or upload a screenshot to get started." /> : null}
              {cases.items.map((c) => {
                const tone = c.serious ? { dot: "bg-bad", well: "bg-bad-bg" } : c.caution ? { dot: "bg-warn", well: "bg-warn-bg" } : { dot: "bg-neutral", well: "bg-neutral-bg" };
                return (
                  <Link key={c.id} href={`/investigations/${c.id}`} className="group -mx-2 flex items-center gap-4 rounded-xl p-2.5 transition-colors hover:bg-muted">
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone.well}`}>
                      <span className={`size-2.5 rounded-full ${tone.dot}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.title}</div>
                      <div className="text-xs text-muted-foreground">{c.city} · {relativeTime(c.updatedAt)}</div>
                    </div>
                    <div className="hidden shrink-0 items-center gap-1 sm:flex">
                      {c.isDemo ? <Badge tone="demo">DEMO</Badge> : null}
                      {c.serious ? <Badge tone="bad">{c.serious} serious</Badge> : null}
                      {c.caution ? <Badge tone="warn">{c.caution} to clarify</Badge> : null}
                      {!c.serious && !c.caution ? <Badge tone="neutral">Unverified</Badge> : null}
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
                  </Link>
                );
              })}
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg">Open findings by type</CardTitle>
            </CardHeader>
            <CardContent>
              <BarList title="Open findings by type" data={(Object.keys(CAT) as Array<keyof typeof CAT>).map((k) => ({ label: CAT[k], value: Number(byCat.find((b) => b.category === k)?.n ?? 0) }))} />
            </CardContent>
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          <Card className="rounded-2xl">
            <CardHeader><CardTitle className="text-lg">Upcoming dates</CardTitle></CardHeader>
            <CardContent>
              {deadlines.length === 0 ? <p className="text-sm text-muted-foreground">No dates tracked yet.</p> : null}
              <ol className="relative space-y-1 border-l border-border pl-5">
                {deadlines.slice(0, 5).map((d, i) => (
                  <li key={i} className="relative">
                    <span className={`absolute -left-[25px] top-3.5 size-2.5 rounded-full ring-4 ring-card ${d.date < today ? "bg-warn" : "bg-teal-strong"}`} />
                    <Link href={d.href} className="flex items-center justify-between gap-3 rounded-lg p-2 text-sm hover:bg-muted">
                      <span>{d.label}</span>
                      <Badge tone={d.date < today ? "warn" : "info"}>{d.date < today ? "Passed" : formatDate(d.date)}</Badge>
                    </Link>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-lg">Notifications</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link href="/notifications">All</Link></Button>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {notes.length === 0 ? <p className="text-muted-foreground">You're all caught up.</p> : null}
              {notes.map((n) => (
                <Link key={n.id} href={n.link ?? "/notifications"} className="flex gap-3 rounded-lg p-2 hover:bg-muted">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-border" : "bg-teal-strong"}`} />
                  <span className="min-w-0">
                    <span className={`block ${n.readAt ? "text-muted-foreground" : "font-medium"}`}>{n.title}</span>
                    <span className="text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
