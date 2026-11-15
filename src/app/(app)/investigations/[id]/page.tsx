import Link from "next/link";
import { AlertOctagon, BadgeCheck, CircleHelp, Compass, Info, ShieldAlert, ShieldQuestion, Wallet } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getBoard } from "@/server/services/board";
import { aiModeLabel } from "@/server/providers/registry";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/misc";
import { EvidenceStatusBadge } from "@/components/status/status-badge";
import { FindingCard } from "@/components/investigation/finding-card";
import { AgentActivity } from "@/components/investigation/agent-activity";
import { EvidenceGraph } from "@/components/investigation/evidence-graph";
import { ClaimsTable } from "@/components/investigation/claims-table";
import { ActionsList, QuestionsList } from "@/components/investigation/questions-actions";
import { LEGAL_DISCLAIMER } from "@/server/legal/catalog";
import { formatCents } from "@/lib/money";
import { titleCase } from "@/lib/utils";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const b = await getBoard(user.id, id);
  const supersededEv = new Set(b.evidence.map((e) => e.supersedesEvidenceId).filter(Boolean) as string[]);
  const evTitle = new Map(b.evidence.map((e) => [e.id, e.title]));
  const claimsById = new Map(b.claims.map((c) => [c.id, { value: c.value, excerpt: c.excerpt, locator: c.locator, evidenceTitle: evTitle.get(c.evidenceId) ?? "evidence" }]));
  const active = b.claims.filter((c) => !c.supersededAt && !supersededEv.has(c.evidenceId));
  const authority = b.checks.find((c) => c.checkType === "rental_authority");
  const groups = [
    { title: "Contradictions", icon: AlertOctagon, items: b.activeFindings.filter((f) => f.category === "contradiction") },
    { title: "Tenancy rule concerns", icon: ShieldAlert, items: b.activeFindings.filter((f) => f.category === "legal") },
    { title: "Potential warning signs", icon: ShieldQuestion, items: b.activeFindings.filter((f) => f.category === "warning" || f.category === "image") },
    { title: "Not yet verified & unknowns", icon: CircleHelp, items: b.activeFindings.filter((f) => f.category === "verification_gap" || f.category === "unknown") },
    { title: "Context", icon: Info, items: b.activeFindings.filter((f) => f.category === "context") },
  ];
  const resolved = b.findings.filter((f) => f.lifecycle !== "active");
  const fact = (type: string, label: string, money = false) => {
    const cs = active.filter((c) => c.claimType === type);
    if (cs.length === 0) return { label, values: [] as Array<{ v: string; status: string; src: string }> };
    const uniq = new Map<string, { v: string; status: string; src: string }>();
    for (const c of cs) {
      const v = money && /^\d+$/.test(c.normalized) ? formatCents(Number(c.normalized)) : c.value;
      if (!uniq.has(c.normalized)) uniq.set(c.normalized, { v, status: c.status, src: evTitle.get(c.evidenceId) ?? "" });
    }
    return { label, values: [...uniq.values()] };
  };
  const facts = [
    fact("rent", "Monthly rent", true),
    fact("deposit", "Deposit", true),
    fact("requested_payment", "Payment requested", true),
    fact("address", "Address"),
    fact("bedrooms", "Bedrooms"),
    fact("bathrooms", "Bathrooms"),
    fact("lease_term", "Lease term"),
    fact("move_in_date", "Move-in"),
    fact("utilities", "Utilities"),
    fact("contact_name", "Contact"),
    fact("payment_recipient", "Payment recipient"),
    fact("payment_method", "Payment method"),
  ];
  const tone = b.headline.tone === "serious" ? "bad" : b.headline.tone === "caution" ? "warn" : "neutral";
  const ai = aiModeLabel();

  if (b.evidence.length === 0) {
    return (
      <EmptyState
        title="No evidence yet"
        description="Add the listing (paste, screenshot or link), landlord messages and the lease. The agent will extract statements and check them."
        action={<Button asChild variant="teal"><Link href={`/investigations/${id}/evidence`}>Add evidence</Link></Button>}
      />
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <Callout tone={tone} title={b.headline.text} icon={b.headline.tone === "neutral" ? <Info /> : <AlertOctagon />}>
          {b.inv.summary ? <p className="mt-1">{b.inv.summary}</p> : <p className="mt-1">Run checks to generate a summary.</p>}
        </Callout>

        <div className={`flex items-start gap-3 rounded-lg border p-4 ${authority?.status === "supported" ? "border-ok/30 bg-ok-bg" : "border-border bg-card"}`}>
          {authority?.status === "supported" ? <BadgeCheck className="mt-0.5 size-5 text-ok" aria-hidden /> : <ShieldQuestion className="mt-0.5 size-5 text-neutral" aria-hidden />}
          <div className="text-sm">
            <div className="font-semibold">
              {authority?.status === "supported" ? "You recorded independent confirmation of rental authority" : "Rental authority has not been independently verified."}
            </div>
            <p className="text-muted-foreground">
              {authority?.status === "supported"
                ? `${authority.summary ?? ""} This reflects your own verification; SafeLease does not certify landlords.`
                : "A real address or a matching name does not prove that the person messaging you may rent this unit."}{" "}
              <Link href={`/investigations/${id}/verification`} className="text-blue hover:underline">Open verification checklist</Link>
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>What the evidence says</CardTitle>
            <CardDescription>Extracted statements, not verified facts. Conflicting values are shown side by side.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {facts.map((f) => (
                <div key={f.label} className="rounded-md border border-border p-3">
                  <dt className="text-xs font-medium text-muted-foreground">{f.label}</dt>
                  {f.values.length === 0 ? (
                    <dd className="mt-1 text-sm text-muted-foreground">Not stated</dd>
                  ) : (
                    f.values.map((v, i) => (
                      <dd key={i} className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="font-medium">{v.v}</span>
                        {v.status !== "unverified" ? <EvidenceStatusBadge status={v.status} /> : null}
                        <span className="w-full truncate text-[11px] text-muted-foreground">{v.src}</span>
                      </dd>
                    ))
                  )}
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        {groups.map((g) =>
          g.items.length ? (
            <section key={g.title} aria-labelledby={`h-${g.title}`}>
              <h2 id={`h-${g.title}`} className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <g.icon className="size-4 text-muted-foreground" aria-hidden /> {g.title} <span className="text-muted-foreground">({g.items.length})</span>
              </h2>
              <div className="space-y-2">
                {g.items.map((f) => (
                  <FindingCard key={f.id} f={f} investigationId={id} claimsById={claimsById} />
                ))}
              </div>
            </section>
          ) : null,
        )}

        <Card>
          <CardHeader>
            <CardTitle>Investigation graph</CardTitle>
            <CardDescription>Every node is a stored record: evidence, the statements extracted from it, and the findings that rely on them.</CardDescription>
          </CardHeader>
          <CardContent>
            <EvidenceGraph
              evidence={b.evidence.map((e) => ({ id: e.id, title: e.title, kind: e.kind, superseded: supersededEv.has(e.id) }))}
              claims={b.claims.map((c) => ({ id: c.id, evidenceId: c.evidenceId, claimType: c.claimType, value: c.value, status: c.status, superseded: Boolean(c.supersededAt) || supersededEv.has(c.evidenceId), excerpt: c.excerpt, locator: c.locator }))}
              links={b.links.map((l) => ({ fromClaimId: l.fromClaimId, toClaimId: l.toClaimId, relation: l.relation, explanation: l.explanation }))}
              findings={b.activeFindings.filter((f) => f.claimIds.length > 0).map((f) => ({ id: f.id, title: f.title, severity: f.severity, label: f.label, claimIds: f.claimIds, evidenceIds: f.evidenceIds }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All extracted statements</CardTitle>
            <CardDescription>Correct anything that was misread. Corrections are added as new statements; originals are kept.</CardDescription>
          </CardHeader>
          <CardContent>
            <ClaimsTable claims={b.claims.map((c) => ({ ...c, evidenceTitle: evTitle.get(c.evidenceId) ?? "", evidenceSuperseded: supersededEv.has(c.evidenceId) }))} />
          </CardContent>
        </Card>

        {resolved.length ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold">Resolved & dismissed ({resolved.length})</h2>
            <div className="space-y-2">
              {resolved.map((f) => (
                <FindingCard key={f.id} f={f} investigationId={id} claimsById={claimsById} />
              ))}
            </div>
          </section>
        ) : null}
        <p className="text-xs text-muted-foreground">{LEGAL_DISCLAIMER}</p>
      </div>

      <aside className="space-y-6">
        <AgentActivity
          investigationId={id}
          aiLabel={ai.label}
          compact
          initialRun={b.latestRun ? { ...b.latestRun, startedAt: b.latestRun.startedAt.toISOString(), finishedAt: b.latestRun.finishedAt?.toISOString() ?? null } : null}
          initialTools={b.latestTools.map((t) => ({ id: t.id, tool: t.tool, status: t.status, mode: t.mode, reason: t.reason, summary: (t.output as { summary?: string } | null)?.summary ?? t.error, iteration: t.iteration, durationMs: t.durationMs }))}
        />
        <Card>
          <CardHeader>
            <CardTitle>Next questions for the landlord</CardTitle>
            <CardDescription>Generated from the open findings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <QuestionsList questions={b.questions.slice(0, 6)} />
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={`/investigations/${id}/communications`}>Draft a message</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Proposed actions</CardTitle>
            <CardDescription>Nothing happens without your approval.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionsList investigationId={id} actions={b.actions} />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-card to-accent/40">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 font-semibold"><Wallet className="size-4 text-teal" aria-hidden /> Before you pay</div>
            <p className="text-sm text-muted-foreground">Review the requested amount, deposit limit, recipient and verification status before sending money.</p>
            <Button asChild size="sm" className="w-full"><Link href={`/investigations/${id}/verification#before-you-pay`}>Open before-you-pay review</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 font-semibold"><Compass className="size-4 text-blue" aria-hidden /> Explore alternatives</div>
            <p className="text-sm text-muted-foreground">Search nearby rentals using this listing's size and budget{active.some((c) => c.claimType === "rent") ? "" : " (add rent to pre-fill)"}.</p>
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link href={`/discover?from=${id}${(() => { const r = active.find((c) => c.claimType === "rent"); const bd = active.find((c) => c.claimType === "bedrooms"); return `${r ? `&budgetMax=${Math.round((Number(r.normalized) * 1.15) / 100)}` : ""}${bd ? `&bedroomsMin=${bd.normalized}` : ""}${b.inv.city ? `&city=${encodeURIComponent(b.inv.city)}` : ""}`; })()}`}>
                Discover rentals
              </Link>
            </Button>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">Extracted fields: {titleCase(String(active.length))} current statements from {b.evidence.length} evidence item(s).</p>
      </aside>
    </div>
  );
}
