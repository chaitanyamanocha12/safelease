import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileDown } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getLeaseReview } from "@/server/services/leases";
import { AppError } from "@/server/errors";
import { formatCents } from "@/lib/money";
import { titleCase } from "@/lib/utils";
import type { LeaseTerms } from "@/server/leases/analyze";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, Table, Td, Th } from "@/components/ui/misc";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { addLeaseVersionAction } from "@/server/actions/tenancy";
import { LEGAL_DISCLAIMER } from "@/server/legal/catalog";

const CLASS: Record<string, { label: string; tone: "bad" | "warn" | "review" | "neutral" | "ok" | "info" }> = {
  clear_rule_violation: { label: "Clear rule concern (if facts accurate)", tone: "bad" },
  potential_issue: { label: "Potential issue — needs more facts", tone: "warn" },
  unusual_term: { label: "Unusual but not necessarily prohibited", tone: "info" },
  incomplete_extraction: { label: "Incomplete extraction", tone: "neutral" },
  unverified_interpretation: { label: "Unverified interpretation", tone: "review" },
  standard: { label: "No concern identified", tone: "ok" },
};

export default async function LeaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let r;
  try {
    r = await getLeaseReview(user.id, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const t = r.latest.terms as unknown as LeaseTerms;
  const a = r.analysis;
  const flagged = r.clauses.filter((c) => c.classification !== "standard");
  const termRows: Array<[string, string, string | undefined]> = [
    ["Monthly rent", t.rentCents ? formatCents(t.rentCents) : "Not found", "rent"],
    ["Security deposit", t.depositCents !== null ? formatCents(t.depositCents) : "Not found", "deposit"],
    ["Lease type", titleCase(t.leaseType), "leaseTerm"],
    ["Term", t.leaseTermLabel ?? "Not found", "leaseTerm"],
    ["Start", t.startDate ?? "Not found", "startDate"],
    ["End", t.endDate ?? "Not stated", undefined],
    ["Utilities included", t.utilitiesIncluded.join(", ") || "None stated", undefined],
    ["Tenant pays", t.utilitiesTenantPays.join(", ") || "None stated", undefined],
    ["Parking", t.parking ?? "Not stated", undefined],
    ["Late fee", t.lateFee ?? "Not stated", "lateFee"],
    ["Other fees", t.otherFees.join("; ") || "None found", undefined],
    ["Landlord", t.landlordName ?? "Not found", undefined],
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex gap-1.5">{r.lease.isDemo ? <Badge tone="demo">DEMO</Badge> : null}<Badge tone="outline">Version {r.latest.version} of {r.versions.length}</Badge><Badge tone="outline">Text extraction: {r.latest.extractionStatus}</Badge></div>
          <h1 className="text-2xl font-semibold tracking-tight">{r.lease.title}</h1>
        </div>
        <div className="flex gap-2">
          {r.lease.investigationId ? <Button asChild variant="outline"><Link href={`/investigations/${r.lease.investigationId}`}>Open investigation</Link></Button> : null}
          <Button asChild variant="outline"><a href={`/api/reports/lease/${r.lease.id}?format=pdf`}><FileDown /> Lease review (PDF)</a></Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {(["clear_rule_violation", "potential_issue", "unusual_term", "unverified_interpretation"] as const).map((k) => (
          <div key={k} className="rounded-lg border border-border bg-card p-4"><div className="text-2xl font-semibold">{a.counts[k]}</div><div className="text-xs text-muted-foreground">{CLASS[k]!.label}</div></div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lease document</CardTitle>
            <CardDescription>Flagged clauses are highlighted. Page numbers come from the PDF text layer.</CardDescription>
          </CardHeader>
          <CardContent>
            {r.latest.documentVersionId ? <a href={`/api/files/${r.latest.documentVersionId}`} target="_blank" className="mb-3 inline-flex items-center gap-1 text-sm text-blue hover:underline">Open original file <ExternalLink className="size-3" /></a> : null}
            <div className="max-h-[720px] space-y-2 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-sm">
              {r.clauses.map((c) => (
                <div key={c.id} id={`clause-${c.id}`} className={`rounded-md p-2 ${c.classification === "clear_rule_violation" ? "bg-bad-bg ring-1 ring-bad/30" : c.classification === "potential_issue" ? "bg-warn-bg ring-1 ring-warn/30" : c.classification === "standard" ? "" : "bg-info-bg"}`}>
                  {c.page ? <span className="mr-2 rounded bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">p.{c.page}</span> : null}
                  <span className="whitespace-pre-wrap">{c.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Flagged clauses</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {flagged.length === 0 ? <p className="text-sm text-muted-foreground">No clauses flagged. That doesn't mean the lease is complete or fair — review the missing terms below.</p> : null}
              {flagged.map((c) => (
                <div key={c.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5"><Badge tone={CLASS[c.classification]!.tone}>{CLASS[c.classification]!.label}</Badge><Badge tone="outline">{titleCase(c.clauseType)}</Badge>{c.page ? <Badge tone="outline">page {c.page}</Badge> : null}</div>
                  <a href={`#clause-${c.id}`} className="line-clamp-2 text-xs italic text-muted-foreground hover:underline">“{c.text.slice(0, 180)}”</a>
                  {c.explanation ? <p className="mt-1.5">{c.explanation}</p> : null}
                  {c.citationUrl ? <a href={c.citationUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-blue hover:underline">Official source ({c.ruleKey})</a> : null}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Key terms</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <tbody>
                  {termRows.map(([k, v, src]) => (
                    <tr key={k}><Th className="normal-case tracking-normal">{k}</Th><Td><div>{v}</div>{src && t.sources[src] ? <div className="text-xs text-muted-foreground">{t.sources[src]!.locator}</div> : null}</Td></tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
          {a.missingTerms.length ? (
            <Callout tone="warn" title="Missing or unclear terms">
              <ul className="mt-1 list-disc pl-4">{a.missingTerms.map((m) => <li key={m}>{m}</li>)}</ul>
            </Callout>
          ) : null}
          {a.comparison.length ? (
            <Card>
              <CardHeader><CardTitle>Lease vs listing</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <thead><tr><Th>Term</Th><Th>Lease</Th><Th>Listing</Th><Th>Match</Th></tr></thead>
                  <tbody>{a.comparison.map((c) => <tr key={c.field}><Td>{c.field}</Td><Td>{c.lease}</Td><Td>{c.listing}</Td><Td>{c.match ? <Badge tone="ok">Matches</Badge> : <Badge tone="bad">Differs</Badge>}</Td></tr>)}</tbody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
          {r.diff.length ? (
            <Card>
              <CardHeader><CardTitle>Changes from version {r.latest.version - 1}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <thead><tr><Th>Term</Th><Th>Before</Th><Th>After</Th></tr></thead>
                  <tbody>{r.diff.map((d) => <tr key={d.field}><Td>{d.field}</Td><Td className="text-muted-foreground line-through">{d.before}</Td><Td className="font-medium">{d.after}</Td></tr>)}</tbody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader><CardTitle>Questions to ask before signing</CardTitle></CardHeader>
            <CardContent><ol className="list-decimal space-y-1.5 pl-5 text-sm">{a.questions.map((q) => <li key={q}>{q}</li>)}</ol></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Add a revised version</CardTitle><CardDescription>Earlier versions are kept and compared.</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={addLeaseVersionAction} mode="formdata" extra={{ leaseId: r.lease.id }} success="Revised version analyzed" className="space-y-3">
                <Field label="File" htmlFor="rv-f"><Input id="rv-f" name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,text/plain" className="h-auto py-2" /></Field>
                <Field label="Or paste the revised text" htmlFor="rv-t"><Textarea id="rv-t" name="text" rows={4} /></Field>
                <SubmitButton pendingLabel="Analyzing…">Add version</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{LEGAL_DISCLAIMER}</p>
    </div>
  );
}
