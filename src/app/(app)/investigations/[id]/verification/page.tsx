import { CheckCircle2, CircleDashed, CloudOff, HelpCircle, Image as ImageIcon, XCircle } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getBoard } from "@/server/services/board";
import { CHECKLIST, getPrepayment } from "@/server/services/prepayment";
import { directory, listMyConsents, notesForRenter } from "@/server/services/organizations";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/misc";
import { EvidenceForm } from "@/components/investigation/evidence-form";
import { PrepaymentForm, RecordVerificationForm, ShareCaseForm } from "@/components/investigation/verification-forms";
import { AUTHORITY_UNVERIFIED } from "@/server/investigation/gaps";
import { formatDateTime } from "@/lib/utils";
import type { ImageMatchRecord } from "@/server/investigation/types";

const CHECK_LABEL: Record<string, string> = {
  rental_authority: "Authority to rent this unit",
  independent_contact: "Independent contact verification",
  viewing_confirmed: "Viewing of the unit",
  payment_recipient_consistency: "Payment recipient consistency",
  lease_matches_listing: "Lease matches advertisement",
  address_validity: "Address check",
  public_business_info: "Public business research",
  image_reuse_local: "Local image reuse check",
  image_reuse_web: "Web image search",
};
const ORDER = ["rental_authority", "independent_contact", "viewing_confirmed", "payment_recipient_consistency", "lease_matches_listing", "address_validity", "public_business_info", "image_reuse_local", "image_reuse_web"];

function StatusPill({ status }: { status: string }) {
  const m: Record<string, { label: string; tone: "ok" | "bad" | "neutral" | "warn"; Icon: typeof CheckCircle2 }> = {
    supported: { label: "Supported", tone: "ok", Icon: CheckCircle2 },
    contradicted: { label: "Contradicted", tone: "bad", Icon: XCircle },
    unverified: { label: "Unverified", tone: "neutral", Icon: HelpCircle },
    provider_unavailable: { label: "Provider unavailable", tone: "neutral", Icon: CloudOff },
    not_started: { label: "Not checked", tone: "neutral", Icon: CircleDashed },
    not_applicable: { label: "Not applicable", tone: "neutral", Icon: CircleDashed },
    in_progress: { label: "In progress", tone: "warn", Icon: CircleDashed },
  };
  const x = m[status] ?? m.not_started!;
  return <Badge tone={x.tone}><x.Icon aria-hidden /> {x.label}</Badge>;
}

export default async function VerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [b, pp, orgs, consents, notes] = await Promise.all([getBoard(user.id, id), getPrepayment(user.id, id), directory(), listMyConsents(user.id), notesForRenter(user.id, id)]);
  const checks = new Map(b.checks.map((c) => [c.checkType, c]));
  const local = checks.get("image_reuse_local");
  const web = checks.get("image_reuse_web");
  const localMatches = ((local?.details as { matches?: ImageMatchRecord[] } | null)?.matches ?? []);
  const photos = b.evidence.filter((e) => e.kind === "property_photo" || e.kind === "listing_screenshot");
  const grants = consents.filter((c) => c.grant.resourceId === id).map((c) => ({ id: c.grant.id, orgName: c.orgName, scope: c.grant.scope, status: c.grant.status, grantedAt: c.grant.grantedAt }));

  return (
    <div className="space-y-6">
      <Callout tone={checks.get("rental_authority")?.status === "supported" ? "ok" : "neutral"} title={checks.get("rental_authority")?.status === "supported" ? "You recorded independent confirmation of rental authority." : AUTHORITY_UNVERIFIED}>
        Nova Scotia's property registry (Property Online) requires paid, authorized access that SafeLease does not have. Even registered ownership would not prove that the person messaging you may rent the unit. Verification here comes from checks you perform through independent channels, plus the limited provider checks shown.
      </Callout>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Verification checklist</CardTitle>
            <CardDescription>Each check shows who performed it and how.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ORDER.map((t) => {
              const c = checks.get(t as never);
              const hist = c ? b.history.filter((h) => h.checkId === c.id) : [];
              return (
                <div key={t} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{CHECK_LABEL[t]}</span>
                    <StatusPill status={c?.status ?? "not_started"} />
                  </div>
                  {c?.summary ? <p className="mt-1 text-sm text-muted-foreground">{c.summary}</p> : <p className="mt-1 text-sm text-muted-foreground">Not checked yet.</p>}
                  {c ? <p className="mt-1 text-xs text-muted-foreground">{c.method ?? ""}{c.providerMode ? ` · ${c.providerMode === "USER" ? "renter-reported" : c.providerMode}` : ""}{c.checkedAt ? ` · ${formatDateTime(c.checkedAt)}` : ""}</p> : null}
                  {t === "public_business_info" && (c?.details as { results?: Array<{ title: string; url: string }> } | null)?.results?.length ? (
                    <ul className="mt-2 space-y-1 text-xs">
                      {(c!.details as { results: Array<{ title: string; url: string }> }).results.map((r, i) => (
                        <li key={i}><a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="text-blue hover:underline">{r.title}</a> <span className="text-muted-foreground">(unverified lead)</span></li>
                      ))}
                    </ul>
                  ) : null}
                  {hist.length > 1 ? (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">History ({hist.length})</summary>
                      <ul className="mt-1 space-y-1">{hist.map((h) => <li key={h.id}>{formatDateTime(h.createdAt)} · {h.fromStatus ?? "—"} → {h.toStatus} · {h.actor}{h.note ? ` · ${h.note}` : ""}</li>)}</ul>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Record a check you performed</CardTitle></CardHeader>
            <CardContent><RecordVerificationForm investigationId={id} /></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Upload authority documents</CardTitle>
              <CardDescription>e.g. a property-management agreement or business registration. Uploading does not verify it — record how you confirmed it with the issuer.</CardDescription>
            </CardHeader>
            <CardContent><EvidenceForm investigationId={id} existing={[]} /></CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ImageIcon className="size-4" aria-hidden /> Image investigation</CardTitle>
          <CardDescription>Local fingerprint comparison runs on this server. Web search runs only with a configured provider.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="mb-1 flex items-center justify-between"><span className="font-medium">Local image match</span>{local ? <Badge tone={localMatches.length ? "warn" : "neutral"}>{localMatches.length ? `${localMatches.length} match(es)` : "No match found"}</Badge> : <Badge tone="neutral">Search not performed</Badge>}</div>
            {photos.length === 0 ? <p className="text-muted-foreground">Upload property photos or screenshots to compare.</p> : null}
            {localMatches.map((m, i) => (
              <div key={i} className="mt-2 rounded bg-muted p-2 text-xs">
                <div>{m.matchType === "local_exact" ? "Identical" : "Visually similar"} to {m.matchedLabel} (distance {m.distance})</div>
                {m.conflictingDetails?.length ? <div className="mt-1 text-warn">Conflicting details: {m.conflictingDetails.join("; ")}</div> : null}
              </div>
            ))}
            {local && localMatches.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">No local match does not establish that the photos are original.</p> : null}
          </div>
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">External web image match</span>
              {!web ? <Badge tone="neutral">Search not performed</Badge> : web.status === "provider_unavailable" ? <Badge tone="neutral"><CloudOff /> Provider unavailable</Badge> : <Badge tone={(web.details as { result?: string })?.result === "match" ? "warn" : "neutral"}>{(web.details as { result?: string })?.result === "match" ? "Matches found" : "No external match"}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{web?.summary ?? "Runs when a reverse-image provider (Google Cloud Vision Web Detection) is configured."}</p>
          </div>
          {photos.length ? (
            <div className="flex flex-wrap gap-2 md:col-span-2">
              {photos.filter((p) => p.documentVersionId).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={`/api/files/${p.documentVersionId}`} alt={p.title} className="h-24 w-32 rounded-md border border-border object-cover" loading="lazy" />
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card id="before-you-pay" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Before-you-pay review</CardTitle>
          <CardDescription>Checks the amount, purpose, timing, recipient, authority and pressure before you send money. SafeLease never moves money and never declares a payment safe.</CardDescription>
        </CardHeader>
        <CardContent>
          <PrepaymentForm
            investigationId={id}
            checklist={CHECKLIST}
            initialResult={pp.result}
            initial={{
              amount: pp.input.requestedAmountCents ? String(pp.input.requestedAmountCents / 100) : "",
              purpose: pp.input.purpose ?? "",
              paymentMethod: pp.input.paymentMethod ?? "",
              recipientName: pp.input.recipientName ?? "",
              dueBy: pp.input.dueBy ?? "",
              leaseSigned: pp.input.leaseSigned === true ? "yes" : pp.input.leaseSigned === false ? "no" : "",
              viewedInPerson: pp.input.viewedInPerson === true ? "yes" : pp.input.viewedInPerson === false ? "no" : "",
              checklist: pp.input.checklist ?? {},
            }}
          />
        </CardContent>
      </Card>

      <Card id="share" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Share with an adviser</CardTitle>
          <CardDescription>Your case is private. Organizations (including your university) can't see it unless you share it here. You can revoke at any time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ShareCaseForm investigationId={id} orgs={orgs} grants={grants} />
          {notes.length ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Notes from advisers</h3>
              <ul className="space-y-2">{notes.map((n, i) => <li key={i} className="rounded-md border border-border p-3 text-sm"><div className="text-xs text-muted-foreground">{n.orgName} · {formatDateTime(n.createdAt)}</div>{n.body}</li>)}</ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
