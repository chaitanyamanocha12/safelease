import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Columns3, FileDown } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getComparison } from "@/server/services/discovery";
import { db } from "@/server/db/client";
import { investigation } from "@/server/db/schema";
import { formatCents } from "@/lib/money";
import { titleCase } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { DemoBadge } from "@/components/status/status-badge";
import { CompareControls, RemoveFromCompare } from "@/components/discover/compare-controls";

export const metadata: Metadata = { title: "Compare" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const c = await getComparison(user.id, { originInvestigationId: sp.from ?? null });
  const origins = await db.select({ id: investigation.id, title: investigation.title }).from(investigation).where(eq(investigation.ownerId, user.id));
  const rows = c.ranked;
  const field = (label: string, fn: (l: (typeof rows)[number]["listing"]) => React.ReactNode, origin?: React.ReactNode) => (
    <tr>
      <Th className="whitespace-nowrap bg-muted/50 normal-case tracking-normal">{label}</Th>
      {c.origin ? <Td className="bg-accent/30">{origin ?? "—"}</Td> : null}
      {rows.map((r) => <Td key={r.listing.id}>{fn(r.listing)}</Td>)}
    </tr>
  );
  return (
    <>
      <PageHeader title="Compare properties" description="Side-by-side terms, investigation status and an explainable ranking based on what you value." actions={<Button asChild variant="outline"><a href={`/api/reports/comparison/me?format=pdf`}><FileDown /> Comparison report</a></Button>} />
      {rows.length === 0 ? (
        <EmptyState icon={<Columns3 />} title="Nothing to compare yet" description="Add listings to your comparison from Discover or Saved." action={<Button asChild><Link href="/discover">Discover rentals</Link></Button>} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card>
            <CardContent className="p-0">
              <Table>
                <caption className="sr-only">Property comparison</caption>
                <thead>
                  <tr>
                    <Th className="w-40">&nbsp;</Th>
                    {c.origin ? <Th className="bg-accent/30 normal-case">Original: {c.origin.title}</Th> : null}
                    {rows.map((r, i) => (
                      <Th key={r.listing.id} className="min-w-48 normal-case tracking-normal">
                        <div className="flex items-center gap-1.5 text-foreground"><span className="rounded-full bg-navy px-1.5 text-xs text-white dark:bg-teal-strong dark:text-[#04201d]">#{i + 1}</span> <Link href={`/discover/${r.listing.id}`} className="line-clamp-2 hover:underline">{r.listing.title}</Link></div>
                        <div className="mt-1 flex gap-1">{r.listing.isDemo ? <DemoBadge /> : null}<RemoveFromCompare listingId={r.listing.id} /></div>
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {field("Ranking score", () => null)}
                  <tr>
                    <Th className="bg-muted/50 normal-case tracking-normal">Why it ranks here</Th>
                    {c.origin ? <Td className="bg-accent/30 text-xs">{c.origin.serious ? `${c.origin.serious} serious finding(s) in your investigation` : "—"}</Td> : null}
                    {rows.map((r) => <Td key={r.listing.id} className="text-xs"><div className="mb-1 font-semibold">{Math.round(r.score * 100)}/100</div><ul className="space-y-0.5 text-muted-foreground">{r.reasons.map((x) => <li key={x}>• {x}</li>)}</ul></Td>)}
                  </tr>
                  {field("Rent", (l) => (l.rentCents ? formatCents(l.rentCents) : "—"), c.origin?.rentCents ? formatCents(c.origin.rentCents) : "—")}
                  {field("Deposit", (l) => (l.depositCents ? formatCents(l.depositCents) : "—"))}
                  {field("Upfront payments", (l) => (l.upfrontFeesCents ? formatCents(l.upfrontFeesCents) : "None listed"))}
                  {field("Bedrooms / baths", (l) => `${l.bedrooms ?? "?"} / ${l.bathrooms ?? "?"}`, c.origin?.bedrooms !== null && c.origin?.bedrooms !== undefined ? `${c.origin.bedrooms} / ?` : "—")}
                  {field("Utilities included", (l) => l.utilitiesIncluded.join(", ") || "None stated")}
                  {field("Est. monthly cost disclosed", (l) => (l.rentCents ? `${formatCents(l.rentCents)}${l.utilitiesIncluded.length < 2 ? " + utilities not included" : ""}` : "—"))}
                  {field("Parking", (l) => l.parking ?? "—")}
                  {field("Furnished", (l) => (l.furnished === null ? "—" : l.furnished ? "Yes" : "No"))}
                  {field("Lease type", (l) => (l.leaseType ? titleCase(l.leaseType) : "—"))}
                  {field(`Distance (${c.anchor?.label ?? "anchor"})`, (l) => (l.distanceKm !== null ? `${l.distanceKm} km` : "—"))}
                  {field("Commute", () => <span className="text-muted-foreground">Not estimated</span>)}
                  {field("Investigation", (l) => {
                    const s = c.saved.find((x) => x.listing.id === l.id);
                    if (!s?.saved.investigationId) return <Badge tone="outline">Not investigated</Badge>;
                    return <Link href={`/investigations/${s.saved.investigationId}`}><Badge tone={s.serious ? "bad" : s.caution ? "warn" : "neutral"}>{s.serious ? `${s.serious} serious` : s.caution ? `${s.caution} to clarify` : "No warnings · unverified"}</Badge></Link>;
                  }, c.origin ? <Link href={`/investigations/${c.origin.investigationId}`}><Badge tone={c.origin.serious ? "bad" : "neutral"}>{c.origin.serious ? `${c.origin.serious} serious` : "Open"}</Badge></Link> : null)}
                  {field("Verification gaps", (l) => (c.saved.find((x) => x.listing.id === l.id)?.saved.investigationId ? "See investigation" : "Rental authority, viewing, address all unverified"))}
                  {field("Source", (l) => l.sourceName)}
                </tbody>
              </Table>
            </CardContent>
          </Card>
          <Card className="h-fit">
            <CardHeader><CardTitle>Ranking preferences</CardTitle></CardHeader>
            <CardContent>
              <CompareControls weights={c.weights} anchorKey={(c.anchor as { key?: string } | null)?.key && (c.anchor as { key?: string }).key !== "stored" ? (c.anchor as { key: string }).key : "dalhousie"} origins={origins} originId={c.origin?.investigationId ?? ""} />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
