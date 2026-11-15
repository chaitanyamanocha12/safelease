"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { saveProfileAction } from "@/server/actions/profile";

export interface ProfileValues {
  city: string;
  renterType: string;
  budgetMax: string;
  bedrooms: string;
  desiredLocation: string;
  moveInDate: string;
  accessibilityNeeds: string;
}

export function ProfileForm({ initial, onboarding, redirectTo }: { initial: ProfileValues; onboarding?: boolean; redirectTo?: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ProfileValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  async function save(complete: boolean) {
    setBusy(true);
    const r = await saveProfileAction({ ...v, province: "NS", complete });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Saved");
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(Boolean(onboarding));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="city"><Input id="city" value={v.city} onChange={set("city")} placeholder="Halifax" /></Field>
        <Field label="I am a…" htmlFor="renterType">
          <Select id="renterType" value={v.renterType} onChange={set("renterType")}>
            <option value="">Prefer not to say</option>
            <option value="student">Student</option>
            <option value="international_student">International student</option>
            <option value="newcomer">Newcomer to Canada</option>
            <option value="first_time">First-time renter</option>
            <option value="relocating">Moving from another province</option>
            <option value="general">Renter</option>
          </Select>
        </Field>
        <Field label="Maximum monthly budget ($)" htmlFor="budgetMax"><Input id="budgetMax" inputMode="decimal" value={v.budgetMax} onChange={set("budgetMax")} /></Field>
        <Field label="Bedrooms" htmlFor="bedrooms"><Input id="bedrooms" inputMode="numeric" value={v.bedrooms} onChange={set("bedrooms")} /></Field>
        <Field label="Preferred area" htmlFor="desiredLocation"><Input id="desiredLocation" value={v.desiredLocation} onChange={set("desiredLocation")} placeholder="e.g. near Dalhousie" /></Field>
        <Field label="Move-in date" htmlFor="moveInDate"><Input id="moveInDate" type="date" value={v.moveInDate} onChange={set("moveInDate")} /></Field>
      </div>
      <Field label="Accessibility needs (optional)" htmlFor="acc" hint="Used only to pre-fill discovery filters."><Textarea id="acc" rows={2} value={v.accessibilityNeeds} onChange={set("accessibilityNeeds")} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="teal" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} {onboarding ? "Save and continue" : "Save"}</Button>
        {onboarding ? <Button type="button" variant="ghost" onClick={() => save(true)}>Skip for now</Button> : null}
      </div>
    </form>
  );
}
