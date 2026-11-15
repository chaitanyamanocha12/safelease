import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, FileDown } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getListingForUser } from "@/server/services/discovery";
import { db } from "@/server/db/client";
import { savedProperty } from "@/server/db/schema";
import { env } from "@/server/env";
import { OpenRouteService } from "@/server/providers/geo-providers";
import { ANCHORS, haversineKm } from "@/lib/geo";
import { formatCents } from "@/lib/money";
import { formatDate, titleCase } from "@/lib/utils";
import { AppError } from "@/server/errors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, Table, Td, Th } from "@/components/ui/misc";
import { DemoBadge, ProviderBadge } from "@/components/status/status-badge";
import { RentalMapLazy } from "@/components/discover/map-loader";
import { ListingActions } from "@/components/discover/listing-actions";

export default async function ListingDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let l;
  try {
    l = await getListingForUser(user.id, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const [s] = await db.select().from(savedProperty).where(and(eq(savedProperty.userId, user.id), eq(savedProperty.listingId, id)));
  const routing = new OpenRouteService();
  const routes = l.lat !== null && l.lng !== null ? await routing.route({ lat: l.lat, lng: l.lng }, ANCHORS[0]!) : [];
  const facts: Array<[string, string]> = [
    ["Monthly rent", l.rentCents ? formatCents(l.rentCents) : "Not stated"],
    ["Deposit listed", l.depositCents ? `${formatCents(l.depositCents)}${l.rentCents && l.depositCents > l.rentCents / 2 ? " — above the half-month limit" : ""}` : "Not stated"],
    ["Bedrooms / bathrooms", `${l.bedrooms === 0 ? "Studio" : l.bedrooms ?? "?"} / ${l.bathrooms ?? "?"}`],
    ["Type", l.propertyType ? titleCase(l.propertyType) : "Not stated"],
    ["Lease", l.leaseType ? titleCase(l.leaseType) : "Not stated"],
    ["Available", l.availableFrom ? formatDate(l.availableFrom) : "Not stated"],
    ["Utilities included", l.utilitiesIncluded.join(", ") || "None stated"],
    ["Parking", l.parking ?? "Not stated"],
    ["Pets", l.petsAllowed === null ? "Not stated" : l.petsAllowed ? "Allowed" : "Not allowed"],
    ["Furnished", l.furnished === null ? "Not stated" : l.furnished ? "Yes" : "No"],
    ["Accessibility", l.accessibilityFeatures.join(", ") || "None stated"],
  ];
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href="/discover"><ArrowLeft /> Back to results</Link></Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap gap-1.5">{l.isDemo ? <DemoBadge label="DEMO — fictional listing" /> : <Badge tone="ok">{l.sourceName}</Badge>}<Badge tone="outline">Availability not verified</Badge></div>
          <h1 className="text-2xl font-semibold tracking-tight">{l.title}</h1>
          <p className="text-sm text-muted-foreground">{l.address ?? `${l.neighbourhood ?? ""} ${l.city}`}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold">{l.rentCents ? formatCents(l.rentCents) : "—"}<span className="text-sm font-normal text-muted-foreground">/month</span></div>
          <Button asChild variant="ghost" size="sm"><Link href={`/api/reports/listing/${l.id}?format=json`}><FileDown /> Export details</Link></Button>
        </div>
      </div>
      {l.isDemo ? <Callout tone="warn">This is a fictional demonstration listing. It is not a real or available rental, and its map position is an approximate neighbourhood area.</Callout> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {l.imageUrls[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.imageUrls[0]} alt={l.isDemo ? "Generated demo illustration, not a photo of a real unit" : l.title} className="aspect-[3/2] w-full rounded-lg border border-border object-cover" />
          ) : null}
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {facts.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-border py-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
                ))}
              </dl>
              {l.description ? <p className="mt-4 text-sm text-muted-foreground">{l.description}</p> : null}
              {l.features.length ? <div className="mt-3 flex flex-wrap gap-1">{l.features.map((f) => <Badge key={f} tone="outline">{f}</Badge>)}</div> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Source & freshness</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>Source: {l.sourceName} ({l.sourceKind.replace("_", " ")})</p>
              <p>Retrieved: {formatDate(l.retrievedAt, { dateStyle: "medium", timeStyle: "short" })}{l.publishedAt ? ` · published ${formatDate(l.publishedAt)}` : ""}</p>
              <p>Data confidence: {l.dataConfidence}</p>
              <p>Coordinates: {l.coordinatesSource === "fictional_demo" ? "approximate fictional demo location" : l.coordinatesSource}</p>
              {l.sourceUrl ? <a className="text-blue hover:underline" href={l.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">Original listing</a> : null}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardContent>
              <ListingActions listingId={l.id} saved={Boolean(s)} inCompare={Boolean(s?.inComparison)} watch={Boolean(s?.watch)} notes={s?.notes ?? ""} investigationId={s?.investigationId ?? null} />
            </CardContent>
          </Card>
          {l.lat !== null && l.lng !== null ? (
            <RentalMapLazy listings={[{ id: l.id, title: l.title, lat: l.lat, lng: l.lng, rentCents: l.rentCents, isDemo: l.isDemo }]} tileUrl={env().MAP_TILE_URL} attribution={env().MAP_TILE_ATTRIBUTION} height={260} />
          ) : (
            <Callout tone="neutral">No verifiable coordinates for this listing, so it isn't shown on the map.</Callout>
          )}
          <Card>
            <CardHeader><CardTitle>Distance & commute</CardTitle></CardHeader>
            <CardContent>
              {l.lat === null || l.lng === null ? (
                <p className="text-sm text-muted-foreground">Distances need coordinates.</p>
              ) : (
                <Table>
                  <thead><tr><Th>To</Th><Th>Straight-line</Th></tr></thead>
                  <tbody>{ANCHORS.slice(0, 5).map((a) => <tr key={a.key}><Td>{a.label}</Td><Td>{haversineKm({ lat: l.lat!, lng: l.lng! }, a).toFixed(1)} km</Td></tr>)}</tbody>
                </Table>
              )}
              <div className="mt-3 space-y-1 text-sm">
                <p className="font-medium">Travel time to {ANCHORS[0]!.label}</p>
                {routes.map((r) => (
                  <div key={r.mode} className="flex items-center justify-between gap-2">
                    <span>{titleCase(r.mode)}</span>
                    {r.status === "LIVE" && r.minutes !== null ? <span>{r.minutes} min ({r.km} km)</span> : <ProviderBadge status={r.status === "UNAVAILABLE" ? "UNAVAILABLE" : "NOT_CONFIGURED"} />}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Transit times aren't available — no transit data provider is integrated.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
