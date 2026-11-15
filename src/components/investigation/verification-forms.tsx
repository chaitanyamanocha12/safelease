"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Callout } from "@/components/ui/misc";
import { recordVerificationAction } from "@/app/(app)/investigations/actions";
import { revokeShareAction, savePrepaymentAction, shareCaseAction } from "@/server/actions/verification";

const CHECKS = [
  ["rental_authority", "Authority to rent (owner or authorized manager)"],
  ["independent_contact", "Contact confirmed through an independently found channel"],
  ["viewing_confirmed", "Unit viewed in person or by verified live video"],
  ["payment_recipient_consistency", "Payment recipient matches landlord/manager"],
  ["lease_matches_listing", "Lease terms match what was advertised"],
] as const;

export function RecordVerificationForm({ investigationId }: { investigationId: string }) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        const r = await recordVerificationAction({ investigationId, checkType: fd.get("checkType"), status: fd.get("status"), method: fd.get("method"), note: fd.get("note") || undefined });
        setBusy(false);
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          return toast.error(r.error);
        }
        setErrors({});
        (e.target as HTMLFormElement).reset();
        toast.success("Verification recorded. The case is being re-evaluated.");
      }}
    >
      <Field label="What did you check?" htmlFor="checkType">
        <Select id="checkType" name="checkType">{CHECKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
      </Field>
      <Field label="Result" htmlFor="status">
        <Select id="status" name="status" defaultValue="supported">
          <option value="supported">Supported — my check confirmed it</option>
          <option value="contradicted">Contradicted — my check found a problem</option>
          <option value="unverified">Inconclusive</option>
          <option value="not_applicable">Not applicable</option>
        </Select>
      </Field>
      <Field label="How did you check?" htmlFor="method" error={errors.method} hint="e.g. “Called Harbour Property Mgmt using the number on their official website; they confirmed the unit and agent.”">
        <Input id="method" name="method" required />
      </Field>
      <Field label="Notes (optional)" htmlFor="note"><Textarea id="note" name="note" rows={2} /></Field>
      <Callout tone="neutral">Only record “supported” for checks you actually did through sources you trust. Contact details supplied by the advertiser are not independent.</Callout>
      <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} Record verification</Button>
    </form>
  );
}

interface PrepayItem { key: string; label: string; status: "ok" | "concern" | "unknown"; detail: string; citationLabel?: string; citationUrl?: string }

export function PrepaymentForm({ investigationId, initial, checklist, initialResult }: { investigationId: string; initial: { amount: string; purpose: string; paymentMethod: string; recipientName: string; dueBy: string; leaseSigned: string; viewedInPerson: string; checklist: Record<string, boolean> }; checklist: ReadonlyArray<{ key: string; label: string }>; initialResult: { items: PrepayItem[]; headline: string; concerns: number } }) {
  const [state, setState] = useState(initial);
  const [result, setResult] = useState(initialResult);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof state, v: string) => setState((s) => ({ ...s, [k]: v }));
  const done = checklist.filter((c) => state.checklist[c.key]).length;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await savePrepaymentAction({ investigationId, ...state, purpose: state.purpose || undefined, leaseSigned: state.leaseSigned || undefined, viewedInPerson: state.viewedInPerson || undefined });
          setBusy(false);
          if (!r.ok) return toast.error(r.error);
          setResult(r.data);
          toast.success("Review updated");
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount requested ($)" htmlFor="pp-amount"><Input id="pp-amount" inputMode="decimal" value={state.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
          <Field label="What is it for?" htmlFor="pp-purpose">
            <Select id="pp-purpose" value={state.purpose} onChange={(e) => set("purpose", e.target.value)}>
              <option value="">Not sure</option>
              <option value="security_deposit">Security deposit</option>
              <option value="first_month_rent">First month's rent</option>
              <option value="holding_fee">Holding / reservation fee</option>
              <option value="application_fee">Application fee</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Payment method" htmlFor="pp-method"><Input id="pp-method" value={state.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} placeholder="e.g. e-transfer, wire" /></Field>
          <Field label="Recipient name" htmlFor="pp-rec"><Input id="pp-rec" value={state.recipientName} onChange={(e) => set("recipientName", e.target.value)} /></Field>
          <Field label="Have you signed a lease?" htmlFor="pp-lease">
            <Select id="pp-lease" value={state.leaseSigned} onChange={(e) => set("leaseSigned", e.target.value)}><option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option></Select>
          </Field>
          <Field label="Have you viewed the unit?" htmlFor="pp-viewed">
            <Select id="pp-viewed" value={state.viewedInPerson} onChange={(e) => set("viewedInPerson", e.target.value)}><option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option></Select>
          </Field>
        </div>
        <fieldset className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">Your checklist ({done}/{checklist.length})</legend>
          {checklist.map((c) => (
            <label key={c.key} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={Boolean(state.checklist[c.key])} onChange={(e) => setState((s) => ({ ...s, checklist: { ...s.checklist, [c.key]: e.target.checked } }))} />
              {c.label}
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} Update review</Button>
      </form>
      <div className="space-y-3">
        <Callout tone={result.concerns > 0 ? "bad" : "warn"} title={result.headline}>SafeLease can't guarantee that any payment is safe. Never send money you can't afford to lose before verifying.</Callout>
        <ul className="space-y-2">
          {result.items.map((i) => (
            <li key={i.key} className="rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{i.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${i.status === "concern" ? "bg-bad-bg text-bad" : i.status === "ok" ? "bg-ok-bg text-ok" : "bg-neutral-bg text-neutral"}`}>
                  {i.status === "concern" ? "Concern" : i.status === "ok" ? "No issue found" : "Unknown"}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{i.detail}</p>
              {i.citationUrl ? <a className="mt-1 inline-block text-xs text-blue hover:underline" href={i.citationUrl} target="_blank" rel="noopener noreferrer">{i.citationLabel}</a> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ShareCaseForm({ investigationId, orgs, grants }: { investigationId: string; orgs: Array<{ id: string; name: string; orgType: string; isDemo: boolean }>; grants: Array<{ id: string; orgName: string; scope: string; status: string; grantedAt: string | Date }> }) {
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const [scope, setScope] = useState<"redacted" | "full">("redacted");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      {grants.length ? (
        <ul className="space-y-2">
          {grants.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <span>{g.orgName} · {g.scope === "redacted" ? "redacted view" : "full details"} · <strong>{g.status}</strong></span>
              {g.status === "active" ? (
                <Button size="sm" variant="outline" onClick={async () => { const r = await revokeShareAction({ grantId: g.id, investigationId }); if (!r.ok) toast.error(r.error); else toast.success("Sharing revoked immediately."); }}>Revoke</Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {orgs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No organizations are registered on this SafeLease instance yet.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await shareCaseAction({ investigationId, orgId, scope, message: message || undefined, confirm });
            setBusy(false);
            if (!r.ok) return toast.error(r.fieldErrors ? Object.values(r.fieldErrors)[0]! : r.error);
            toast.success("Shared. You can revoke at any time.");
            setConfirm(false);
          }}
        >
          <Field label="Organization" htmlFor="org"><Select id="org" value={orgId} onChange={(e) => setOrgId(e.target.value)}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isDemo ? " (DEMO)" : ""}</option>)}</Select></Field>
          <Field label="What can they see?" htmlFor="scope" hint="Redacted hides your name, the address, contact details and payment names. Uploaded files are never shared.">
            <Select id="scope" value={scope} onChange={(e) => setScope(e.target.value as "redacted" | "full")}>
              <option value="redacted">Redacted summary (recommended)</option>
              <option value="full">Full case details (no files)</option>
            </Select>
          </Field>
          <Field label="Message to the adviser (optional)" htmlFor="smsg"><Textarea id="smsg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> I consent to sharing this case with the selected organization. I understand I can revoke access at any time.</label>
          <Button type="submit" disabled={!confirm || busy}>Share case</Button>
        </form>
      )}
    </div>
  );
}
