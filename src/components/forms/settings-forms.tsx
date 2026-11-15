"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Field, Input, Select } from "@/components/ui/input";
import { savePreferencesAction, saveProfileAction } from "@/server/actions/profile";
import { deleteAccountAction } from "@/server/actions/account";
import { authClient } from "@/lib/auth-client";

type Prefs = { inApp: boolean; email: boolean; deadlineReminders: boolean; listingUpdates: boolean; caseUpdates: boolean };

export function PreferencesForm({ initial, emailAvailable }: { initial: Prefs; emailAvailable: boolean }) {
  const [p, setP] = useState(initial);
  const rows: Array<[keyof Prefs, string, string]> = [
    ["inApp", "In-app notifications", "Show notifications inside SafeLease."],
    ["email", "Email notifications", emailAvailable ? "Also send by email." : "Unavailable — no email provider is configured."],
    ["caseUpdates", "Case updates", "New serious findings and agent results."],
    ["deadlineReminders", "Deadline reminders", "Deposit return and promised repair dates."],
    ["listingUpdates", "Listing & saved-search updates", "Changes to watched listings and new matches."],
  ];
  return (
    <div className="space-y-3">
      {rows.map(([k, l, d]) => (
        <div key={k} className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
          <div><label htmlFor={`pref-${k}`} className="text-sm font-medium">{l}</label><p className="text-xs text-muted-foreground">{d}</p></div>
          <Switch id={`pref-${k}`} label={l} checked={p[k]} disabled={k === "email" && !emailAvailable} onCheckedChange={(v) => setP((x) => ({ ...x, [k]: v }))} />
        </div>
      ))}
      <Button onClick={async () => { const r = await savePreferencesAction(p); if (!r.ok) toast.error(r.error); else toast.success("Preferences saved"); }}>Save preferences</Button>
    </div>
  );
}

export function LanguageForm({ locale }: { locale: "en" | "fr" }) {
  const router = useRouter();
  return (
    <Field label="Interface language" htmlFor="lang" hint="Legal rule text is shown in its official source language (English).">
      <Select id="lang" defaultValue={locale} onChange={async (e) => { const v = e.target.value as "en" | "fr"; document.cookie = `safelease_locale=${v}; path=/; max-age=31536000; samesite=lax`; await saveProfileAction({ locale: v }); router.refresh(); }}>
        <option value="en">English</option>
        <option value="fr">Français</option>
      </Select>
    </Field>
  );
}

export function NameForm({ name }: { name: string }) {
  const [v, setV] = useState(name);
  return (
    <form className="flex items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await saveProfileAction({ name: v }); if (!r.ok) toast.error(r.error); else toast.success("Name updated"); }}>
      <Field label="Display name" htmlFor="nm" className="flex-1"><Input id="nm" value={v} onChange={(e) => setV(e.target.value)} /></Field>
      <Button type="submit">Save</Button>
    </form>
  );
}

export function PasswordForm() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (next.length < 10) return toast.error("Use at least 10 characters."); const r = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true }); if (r.error) toast.error("Current password is incorrect."); else { toast.success("Password changed; other sessions signed out."); setCur(""); setNext(""); } }}>
      <Field label="Current password" htmlFor="cp"><Input id="cp" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
      <Field label="New password" htmlFor="np"><Input id="np" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      <Button type="submit" variant="outline">Change password</Button>
    </form>
  );
}

export function RetentionForm({ days }: { days: number | null }) {
  const [v, setV] = useState(days ? String(days) : "");
  return (
    <form className="flex items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await saveProfileAction({ retentionDays: v }); if (!r.ok) toast.error(r.error); else toast.success("Retention saved"); }}>
      <Field label="Delete closed cases automatically after" htmlFor="ret" className="flex-1" hint="Runs with the retention job. Leave as 'Keep' to keep until you delete.">
        <Select id="ret" value={v} onChange={(e) => setV(e.target.value)}><option value="">Keep until I delete</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">1 year</option></Select>
      </Field>
      <Button type="submit">Save</Button>
    </form>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await deleteAccountAction(v); } catch (err) { toast.error(err instanceof Error ? err.message : "Could not delete account"); setBusy(false); } }}>
      <Field label={`Type ${email} to confirm`} htmlFor="del"><Input id="del" value={v} onChange={(e) => setV(e.target.value)} /></Field>
      <Button type="submit" variant="destructive" disabled={busy || v.toLowerCase() !== email.toLowerCase()}>Permanently delete my account and data</Button>
    </form>
  );
}
