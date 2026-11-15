"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Import, Loader2, Save, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Callout, EmptyState } from "@/components/ui/misc";
import { ProviderBadge } from "@/components/status/status-badge";
import { ANCHORS } from "@/lib/geo";
import type { DiscoverFilters, NormalizedListing } from "@/lib/discover";
import { importListingAction, saveSearchAction } from "@/server/actions/discovery";
import { ListingCard } from "./listing-card";
import { RentalMapLazy } from "./map-loader";

interface Props {
  filters: DiscoverFilters;
  results: NormalizedListing[];
  mapListings: NormalizedListing[];
  total: number;
  statuses: Array<{ sourceKey: string; name: string; status: string; count: number; message?: string }>;
  links: Array<{ platform: string; url: string; note: string }>;
  savedIds: string[];
  compareIds: string[];
  tileUrl: string;
  attribution: string;
  fromInvestigation: { id: string; title: string } | null;
}

export function DiscoverView(p: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [hover, setHover] = useState<string | null>(null);
  const anchor = p.filters.anchorKey ? ANCHORS.find((a) => a.key === p.filters.anchorKey) ?? null : null;
  const mapPoints = useMemo(() => p.mapListings.filter((l) => l.lat !== null && l.lng !== null).map((l) => ({ id: l.id, title: l.title, lat: l.lat!, lng: l.lng!, rentCents: l.rentCents, isDemo: l.isDemo })), [p.mapListings]);
  const allDemo = p.results.length > 0 && p.results.every((r) => r.isDemo);

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const q = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (typeof v === "string" && v !== "" && v !== "any") q.set(k, v);
    if (params.get("from")) q.set("from", params.get("from")!);
    router.push(`/discover?${q.toString()}`);
  }

  return (
    <div className="space-y-4">
      {p.fromInvestigation ? (
        <Callout tone="info" title={`Alternatives to “${p.fromInvestigation.title}”`}>Filters were pre-filled from that investigation. Adjust them below.</Callout>
      ) : null}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={apply} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Search filters">
            <Field label="City" htmlFor="f-city"><Select id="f-city" name="city" defaultValue={p.filters.city ?? ""}><option value="">Any</option>{["Halifax", "Dartmouth", "Bedford", "Sackville"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Neighbourhood" htmlFor="f-nb"><Input id="f-nb" name="neighbourhood" defaultValue={p.filters.neighbourhood ?? ""} placeholder="e.g. South End" /></Field>
            <Field label="Min $" htmlFor="f-min"><Input id="f-min" name="budgetMin" inputMode="numeric" defaultValue={p.filters.budgetMin ?? ""} /></Field>
            <Field label="Max $" htmlFor="f-max"><Input id="f-max" name="budgetMax" inputMode="numeric" defaultValue={p.filters.budgetMax ?? ""} /></Field>
            <Field label="Bedrooms (min)" htmlFor="f-bd"><Select id="f-bd" name="bedroomsMin" defaultValue={p.filters.bedroomsMin?.toString() ?? ""}><option value="">Any</option>{[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n === 0 ? "Studio+" : `${n}+`}</option>)}</Select></Field>
            <Field label="Bathrooms (min)" htmlFor="f-ba"><Select id="f-ba" name="bathroomsMin" defaultValue={p.filters.bathroomsMin?.toString() ?? ""}><option value="">Any</option>{[1, 1.5, 2].map((n) => <option key={n} value={n}>{n}+</option>)}</Select></Field>
            <Field label="Near" htmlFor="f-anchor"><Select id="f-anchor" name="anchorKey" defaultValue={p.filters.anchorKey ?? ""}><option value="">Anywhere</option>{ANCHORS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</Select></Field>
            <Field label="Radius (km)" htmlFor="f-rad"><Input id="f-rad" name="radiusKm" inputMode="decimal" defaultValue={p.filters.radiusKm ?? ""} /></Field>
            <Field label="Type" htmlFor="f-type"><Select id="f-type" name="propertyType" defaultValue={p.filters.propertyType ?? ""}><option value="">Any</option>{["apartment", "house", "townhouse", "basement_suite", "room", "condo", "duplex"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</Select></Field>
            <Field label="Furnished" htmlFor="f-furn"><Select id="f-furn" name="furnished" defaultValue={p.filters.furnished ?? "any"}><option value="any">Any</option><option value="yes">Furnished</option><option value="no">Unfurnished</option></Select></Field>
            <Field label="Available by" htmlFor="f-move"><Input id="f-move" name="moveInBy" type="date" defaultValue={p.filters.moveInBy ?? ""} /></Field>
            <Field label="Sort" htmlFor="f-sort"><Select id="f-sort" name="sort" defaultValue={p.filters.sort ?? "relevance"}><option value="relevance">Relevance</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="distance">Distance</option><option value="newest">Newest</option></Select></Field>
            <fieldset className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2 lg:col-span-4">
              <legend className="sr-only">Requirements</legend>
              {[["parking", "Parking"], ["pets", "Pets allowed"], ["heatIncluded", "Heat included"], ["accessible", "Accessibility features"]].map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name={k} value="true" defaultChecked={Boolean(p.filters[k as keyof DiscoverFilters])} /> {l}</label>
              ))}
            </fieldset>
            <div className="flex items-end gap-2 lg:col-span-2 lg:justify-end">
              <Button type="submit"><SlidersHorizontal /> Apply</Button>
              <SaveSearch filters={p.filters} />
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Sources:</span>
        {p.statuses.map((s) => (
          <span key={s.sourceKey} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1" title={s.message}>
            {s.name} <ProviderBadge status={s.status} /> {s.status === "LIVE" || s.status === "DEMO" ? `${s.count}` : ""}
          </span>
        ))}
      </div>
      {allDemo ? <Callout tone="warn" title="Showing DEMO inventory">These are fictional listings for demonstration. They are not real or available, and locations are approximate neighbourhood areas. No live listing feed is configured.</Callout> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="order-2 space-y-3 lg:order-1">
          <p className="text-sm text-muted-foreground" aria-live="polite">{p.total} result{p.total === 1 ? "" : "s"}</p>
          {p.results.length === 0 ? <EmptyState title="No matches" description="Try widening the budget or removing a filter." /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {p.results.map((l) => (
              <ListingCard key={l.id} l={l} saved={p.savedIds.includes(l.id)} inCompare={p.compareIds.includes(l.id)} selected={hover === l.id} onHover={setHover} />
            ))}
          </div>
        </div>
        <div className="order-1 space-y-3 lg:sticky lg:top-20 lg:order-2 lg:self-start">
          <RentalMapLazy listings={mapPoints} selectedId={hover} onSelect={(id) => router.push(`/discover/${id}`)} anchor={anchor} radiusKm={p.filters.radiusKm ?? null} tileUrl={p.tileUrl} attribution={p.attribution} />
          <p className="text-[11px] text-muted-foreground">Distances are straight-line from the selected point. Commute times are not estimated unless a routing provider is configured.</p>
          <Card>
            <CardHeader><CardTitle>Search other platforms</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p.links.map((l) => (
                <a key={l.platform} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-md border border-border p-2 hover:bg-muted">
                  <span>{l.platform}</span> <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
                </a>
              ))}
              <p className="text-xs text-muted-foreground">SafeLease doesn't fetch or scrape these platforms. Listings there are not checked by SafeLease until you import them.</p>
              <ImportDialog />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SaveSearch({ filters }: { filters: DiscoverFilters }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [alerts, setAlerts] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline"><Save /> Save search</Button></DialogTrigger>
      <DialogContent title="Save this search">
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await saveSearchAction({ name, filters, alerts }); if (!r.ok) return toast.error(r.error); toast.success("Search saved"); setOpen(false); }}>
          <Field label="Name" htmlFor="ss-name"><Input id="ss-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="2BR under $1,800 near Dal" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} /> Notify me about new matches (runs when the job runner/scheduler runs)</label>
          <Button type="submit">Save</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState("Kijiji");
  const [investigate, setInvestigate] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="secondary" size="sm" className="w-full"><Import /> Import a listing you found</Button></DialogTrigger>
      <DialogContent title="Import a listing" description="Paste the listing text from another platform. It stays private to you.">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true);
          const r = await importListingAction({ text, sourceUrl: url, platform, investigate }); setBusy(false);
          if (!r.ok) return toast.error(r.fieldErrors ? Object.values(r.fieldErrors)[0]! : r.error);
          toast.success("Imported");
          setOpen(false);
          router.push(r.data.investigationId ? `/investigations/${r.data.investigationId}` : "/saved");
        }}>
          <Field label="Platform" htmlFor="im-p"><Select id="im-p" value={platform} onChange={(e) => setPlatform(e.target.value)}>{["Kijiji", "Facebook Marketplace", "Rentals.ca", "REALTOR.ca", "Other"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
          <Field label="Listing link (optional)" htmlFor="im-u"><Input id="im-u" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></Field>
          <Field label="Listing text" htmlFor="im-t"><Textarea id="im-t" rows={7} value={text} onChange={(e) => setText(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={investigate} onChange={(e) => setInvestigate(e.target.checked)} /> Start an investigation for it</label>
          <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} Import</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
