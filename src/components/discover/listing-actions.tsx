"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, Columns3, Eye, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { investigateListingAction, toggleSaveAction, updateSavedAction } from "@/server/actions/discovery";

export function ListingActions({ listingId, saved, inCompare, watch, notes, investigationId }: { listingId: string; saved: boolean; inCompare: boolean; watch: boolean; notes: string; investigationId: string | null }) {
  const router = useRouter();
  const [s, setS] = useState({ saved, inCompare, watch, notes });
  const [busy, setBusy] = useState(false);
  const upd = async (patch: { notes?: string; watch?: boolean; inComparison?: boolean }) => {
    const r = await updateSavedAction({ listingId, ...patch });
    if (!r.ok) return toast.error(r.error);
    setS((x) => ({ ...x, ...(patch.notes !== undefined ? { notes: patch.notes } : {}), ...(patch.watch !== undefined ? { watch: patch.watch } : {}), ...(patch.inComparison !== undefined ? { inCompare: patch.inComparison } : {}), saved: true }));
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={async () => { const r = await toggleSaveAction({ listingId, saved: !s.saved }); if (!r.ok) return toast.error(r.error); setS((x) => ({ ...x, saved: !x.saved })); }}>
          {s.saved ? <BookmarkCheck className="text-teal" /> : <Bookmark />} {s.saved ? "Saved" : "Save"}
        </Button>
        <Button variant="outline" onClick={() => upd({ inComparison: !s.inCompare })}><Columns3 /> {s.inCompare ? "In comparison" : "Add to compare"}</Button>
        <Button variant="outline" onClick={() => upd({ watch: !s.watch })}><Eye /> {s.watch ? "Watching" : "Watch"}</Button>
        {investigationId ? (
          <Button onClick={() => router.push(`/investigations/${investigationId}`)}><Search /> Open investigation</Button>
        ) : (
          <Button variant="teal" disabled={busy} onClick={async () => { setBusy(true); const r = await investigateListingAction({ listingId }); setBusy(false); if (!r.ok) return toast.error(r.error); router.push(`/investigations/${r.data.investigationId}`); }}>
            {busy ? <Loader2 className="animate-spin" /> : <Search />} Investigate this listing
          </Button>
        )}
      </div>
      {s.saved ? (
        <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); await upd({ notes: s.notes }); toast.success("Notes saved"); }}>
          <label htmlFor="notes" className="text-sm font-medium">Your notes</label>
          <Textarea id="notes" rows={3} value={s.notes} onChange={(e) => setS((x) => ({ ...x, notes: e.target.value }))} />
          <Button size="sm" type="submit">Save notes</Button>
        </form>
      ) : null}
    </div>
  );
}
