"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { ANCHORS } from "@/lib/geo";
import type { RankingWeights } from "@/lib/discover";
import { saveComparisonAction, updateSavedAction } from "@/server/actions/discovery";

const LABELS: Record<keyof RankingWeights, string> = { price: "Lower rent", distance: "Closer to my place", space: "More space", amenities: "Utilities & amenities", evidence: "Verification evidence" };

export function CompareControls({ weights, anchorKey, origins, originId }: { weights: RankingWeights; anchorKey: string; origins: Array<{ id: string; title: string }>; originId: string }) {
  const router = useRouter();
  const [w, setW] = useState(weights);
  const [a, setA] = useState(anchorKey);
  const [o, setO] = useState(originId);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await saveComparisonAction({ weights: w, anchorKey: a || undefined, originInvestigationId: o || undefined });
        if (!r.ok) return toast.error(r.error);
        router.refresh();
      }}
    >
      <Field label="Measure distance from" htmlFor="anchor"><Select id="anchor" value={a} onChange={(e) => setA(e.target.value)}>{ANCHORS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</Select></Field>
      <Field label="Compare with my original listing" htmlFor="origin"><Select id="origin" value={o} onChange={(e) => setO(e.target.value)}><option value="">None</option>{origins.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">What matters to you?</legend>
        {(Object.keys(LABELS) as Array<keyof RankingWeights>).map((k) => (
          <div key={k}>
            <label htmlFor={`w-${k}`} className="flex justify-between text-sm"><span>{LABELS[k]}</span><span className="text-muted-foreground">{w[k]}</span></label>
            <input id={`w-${k}`} type="range" min={0} max={5} step={1} value={w[k]} onChange={(e) => setW((x) => ({ ...x, [k]: Number(e.target.value) }))} className="w-full accent-[var(--teal-strong)]" />
          </div>
        ))}
      </fieldset>
      <Button type="submit" className="w-full">Update ranking</Button>
      <p className="text-xs text-muted-foreground">Low rent only raises a listing's “price” score. It never counts as evidence for or against legitimacy.</p>
    </form>
  );
}

export function RemoveFromCompare({ listingId }: { listingId: string }) {
  return (
    <Button size="sm" variant="ghost" onClick={async () => { const r = await updateSavedAction({ listingId, inComparison: false }); if (!r.ok) toast.error(r.error); }}>Remove</Button>
  );
}
