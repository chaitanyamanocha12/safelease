import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/server/auth/session";
import { searchRentals } from "@/server/services/discovery";
import { getProfile } from "@/server/services/profile";
import { db } from "@/server/db/client";
import { investigation, savedProperty } from "@/server/db/schema";
import { env } from "@/server/env";
import { discoverFiltersSchema, type DiscoverFilters } from "@/lib/discover";
import { PageHeader } from "@/components/ui/misc";
import { DiscoverView } from "@/components/discover/discover-view";

export const metadata: Metadata = { title: "Discover rentals" };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const raw: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sp)) if (v !== undefined && v !== "" && k !== "from") raw[k] = v;
  let filters: DiscoverFilters = {};
  const parsed = discoverFiltersSchema.safeParse(raw);
  if (parsed.success) filters = parsed.data;
  if (Object.keys(raw).length === 0) {
    const p = await getProfile(user.id);
    filters = { city: p?.city ?? undefined, budgetMax: p?.budgetMaxCents ? p.budgetMaxCents / 100 : undefined, bedroomsMin: p?.bedrooms ?? undefined };
  }
  let from: { id: string; title: string } | null = null;
  if (sp.from) {
    const [inv] = await db.select({ id: investigation.id, title: investigation.title }).from(investigation).where(and(eq(investigation.id, sp.from), eq(investigation.ownerId, user.id)));
    from = inv ?? null;
  }
  const res = await searchRentals(user.id, filters, { originInvestigationId: from?.id });
  const saved = await db.select({ listingId: savedProperty.listingId, inComparison: savedProperty.inComparison }).from(savedProperty).where(eq(savedProperty.userId, user.id));
  return (
    <>
      <PageHeader title="Discover rentals" description="Search available sources. Demo listings are fictional and always labeled. Every result's availability is unverified until you confirm it." />
      <DiscoverView
        filters={filters}
        results={res.results}
        mapListings={res.allForMap}
        total={res.total}
        statuses={res.statuses}
        links={res.externalLinks}
        savedIds={saved.map((s) => s.listingId)}
        compareIds={saved.filter((s) => s.inComparison).map((s) => s.listingId)}
        tileUrl={env().MAP_TILE_URL}
        attribution={env().MAP_TILE_ATTRIBUTION}
        fromInvestigation={from}
      />
    </>
  );
}
