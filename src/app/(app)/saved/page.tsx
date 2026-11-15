import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, Eye } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { listSaved, listSavedSearches } from "@/server/services/discovery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ListingCard } from "@/components/discover/listing-card";
import { SavedSearchRow } from "@/components/discover/saved-search-row";

export const metadata: Metadata = { title: "Saved" };

export default async function SavedPage() {
  const user = await requireUser();
  const [items, searches] = await Promise.all([listSaved(user.id), listSavedSearches(user.id)]);
  return (
    <>
      <PageHeader title="Saved properties" description="Your shortlist, watchlist and saved searches." actions={<Button asChild variant="outline"><Link href="/compare">Compare selected</Link></Button>} />
      {items.length === 0 ? <EmptyState icon={<Bookmark />} title="Nothing saved yet" description="Save listings from Discover to build a shortlist." action={<Button asChild><Link href="/discover">Discover rentals</Link></Button>} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((s) => (
          <div key={s.saved.id} className="space-y-2">
            <ListingCard l={s.listing} saved inCompare={s.saved.inComparison} />
            <div className="flex flex-wrap gap-1 text-xs">
              {s.saved.watch ? <Badge tone="info"><Eye /> Watching</Badge> : null}
              {s.saved.investigationId ? (
                <Link href={`/investigations/${s.saved.investigationId}`}><Badge tone={s.serious ? "bad" : s.caution ? "warn" : "neutral"}>Investigation: {s.serious ? `${s.serious} serious` : s.caution ? `${s.caution} to clarify` : "no warnings yet"}</Badge></Link>
              ) : <Badge tone="outline">Not investigated</Badge>}
              {s.saved.notes ? <span className="w-full text-muted-foreground">“{s.saved.notes}”</span> : null}
            </div>
          </div>
        ))}
      </div>
      <Card className="mt-8">
        <CardHeader><CardTitle>Saved searches</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {searches.length === 0 ? <p className="text-sm text-muted-foreground">No saved searches.</p> : null}
          {searches.map((s) => <SavedSearchRow key={s.id} s={{ id: s.id, name: s.name, filters: s.filters as Record<string, string>, alertsEnabled: s.alertsEnabled, lastRunAt: s.lastRunAt?.toISOString() ?? null, lastResultCount: s.lastResultCount }} />)}
        </CardContent>
      </Card>
    </>
  );
}
