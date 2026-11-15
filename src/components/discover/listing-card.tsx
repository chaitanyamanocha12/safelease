"use client";
import Link from "next/link";
import { useState } from "react";
import { Bath, BedDouble, Bookmark, BookmarkCheck, Columns3, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/status/status-badge";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/money";
import type { NormalizedListing } from "@/lib/discover";
import { toggleSaveAction, updateSavedAction } from "@/server/actions/discovery";

export function ListingCard({ l, saved, inCompare, selected, onHover }: { l: NormalizedListing; saved: boolean; inCompare: boolean; selected?: boolean; onHover?: (id: string | null) => void }) {
  const [isSaved, setSaved] = useState(saved);
  const [cmp, setCmp] = useState(inCompare);
  return (
    <article
      onMouseEnter={() => onHover?.(l.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn("overflow-hidden rounded-lg border border-border bg-card shadow-card transition-shadow hover:shadow-md", selected && "ring-2 ring-teal-strong")}
    >
      <Link href={`/discover/${l.id}`} className="block">
        <div className="relative aspect-[16/9] bg-muted">
          {l.imageUrls[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.imageUrls[0]} alt={l.isDemo ? "Generated demo illustration (not a photo of a real unit)" : `Photo for ${l.title}`} className="size-full object-cover" loading="lazy" />
          ) : null}
          <div className="absolute left-2 top-2 flex gap-1">{l.isDemo ? <DemoBadge /> : <Badge tone="ok">{l.sourceName}</Badge>}</div>
        </div>
        <div className="space-y-1.5 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold">{l.rentCents ? formatCents(l.rentCents) : "Rent not stated"}<span className="text-xs font-normal text-muted-foreground">/mo</span></span>
            {l.distanceKm !== null ? <span className="text-xs text-muted-foreground">{l.distanceKm} km straight-line</span> : null}
          </div>
          <h3 className="line-clamp-1 text-sm font-medium">{l.title}</h3>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><BedDouble className="size-3.5" aria-hidden />{l.bedrooms === 0 ? "Studio" : `${l.bedrooms ?? "?"} bd`}</span>
            <span className="flex items-center gap-1"><Bath className="size-3.5" aria-hidden />{l.bathrooms ?? "?"} ba</span>
            <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{l.neighbourhood ?? l.city}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">Availability: {l.availabilityStatus === "unverified" ? "not verified" : l.availabilityStatus.replace(/_/g, " ")}</div>
        </div>
      </Link>
      <div className="flex gap-1 border-t border-border p-2">
        <Button size="sm" variant="ghost" aria-pressed={isSaved} onClick={async () => { const r = await toggleSaveAction({ listingId: l.id, saved: !isSaved }); if (!r.ok) return toast.error(r.error); setSaved(!isSaved); if (isSaved) setCmp(false); }}>
          {isSaved ? <BookmarkCheck className="text-teal" /> : <Bookmark />} {isSaved ? "Saved" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" aria-pressed={cmp} onClick={async () => { const r = await updateSavedAction({ listingId: l.id, inComparison: !cmp }); if (!r.ok) return toast.error(r.error); setCmp(!cmp); setSaved(true); toast.success(!cmp ? "Added to comparison" : "Removed from comparison"); }}>
          <Columns3 className={cmp ? "text-teal" : undefined} /> {cmp ? "Comparing" : "Compare"}
        </Button>
      </div>
    </article>
  );
}
