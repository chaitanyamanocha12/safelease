"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { createDraftAction } from "@/app/(app)/investigations/actions";

const PURPOSES = [
  ["verification_questions", "Verification questions (from open findings)"],
  ["request_viewing", "Request a viewing"],
  ["verify_management", "Ask for verifiable management information"],
  ["clarify_deposit", "Clarify the deposit"],
  ["clarify_fees", "Clarify unexpected fees"],
  ["rent_discrepancy", "Ask about a rent discrepancy"],
  ["corrected_lease", "Request a corrected lease"],
  ["utilities", "Ask about utilities"],
] as const;

export function NewDraftForm({ investigationId, aiAvailable }: { investigationId: string; aiAvailable: boolean }) {
  const router = useRouter();
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number][0]>("verification_questions");
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await createDraftAction({ investigationId, purpose, useAi });
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        if (r.data.note) toast.warning(r.data.note);
        else toast.success("Draft ready for your review.");
        router.refresh();
      }}
    >
      <Field label="Message purpose" htmlFor="purpose">
        <Select id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)}>
          {PURPOSES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={useAi} disabled={!aiAvailable} onChange={(e) => setUseAi(e.target.checked)} />
        <Sparkles className="size-3.5 text-teal" aria-hidden /> Polish wording with AI {aiAvailable ? "" : "(not configured)"}
      </label>
      <Button type="submit" variant="teal" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} Create draft</Button>
      <p className="text-xs text-muted-foreground">Drafts are never sent automatically.</p>
    </form>
  );
}
