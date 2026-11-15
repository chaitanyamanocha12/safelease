"use client";
import { useState } from "react";
import { ChevronDown, ExternalLink, Scale } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EvidenceStatusBadge, SeverityBadge } from "@/components/status/status-badge";
import { cn, formatDateTime } from "@/lib/utils";
import { reviewFindingAction } from "@/app/(app)/investigations/actions";

export interface FindingView {
  id: string;
  findingKey: string;
  category: string;
  label: string;
  severity: string;
  lifecycle: string;
  title: string;
  explanation: string;
  recommendation: string | null;
  citationLabel: string | null;
  citationUrl: string | null;
  ruleKey: string | null;
  ruleVersion: number | null;
  requiresHumanReview: boolean;
  humanReview: string;
  humanReviewNote: string | null;
  resolutionNote: string | null;
  firstDetectedAt: Date | string;
  claimIds: string[];
}

const CATEGORY_LABEL: Record<string, string> = {
  contradiction: "Contradiction",
  legal: "Tenancy rule",
  warning: "Warning sign",
  unknown: "Unknown",
  verification_gap: "Not yet verified",
  image: "Image",
  context: "Context",
};

export function FindingCard({ f, investigationId, claimsById, readOnly }: { f: FindingView; investigationId: string; claimsById?: Map<string, { value: string; excerpt: string | null; locator: string | null; evidenceTitle: string }>; readOnly?: boolean }) {
  const [open, setOpen] = useState(f.severity === "serious" && f.lifecycle === "active");
  const [busy, setBusy] = useState(false);
  const border = f.lifecycle !== "active" ? "border-l-border" : f.severity === "serious" ? "border-l-bad" : f.severity === "caution" ? "border-l-warn" : "border-l-info";
  async function review(decision: "confirmed" | "disputed" | "dismissed" | "reopen") {
    setBusy(true);
    const r = await reviewFindingAction({ findingId: f.id, investigationId, decision });
    setBusy(false);
    if (!r.ok) toast.error(r.error);
    else toast.success("Saved to the case history.");
  }
  const sources = f.claimIds.map((id) => claimsById?.get(id)).filter(Boolean) as Array<{ value: string; excerpt: string | null; locator: string | null; evidenceTitle: string }>;
  return (
    <article className={cn("rounded-lg border border-border border-l-4 bg-card", border, f.lifecycle !== "active" && "opacity-75")}>
      <button className="flex w-full items-start gap-3 p-4 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={f.severity} />
            <EvidenceStatusBadge status={f.label} />
            <Badge tone="outline">{CATEGORY_LABEL[f.category] ?? f.category}</Badge>
            {f.lifecycle !== "active" ? <Badge tone="ok">{f.lifecycle === "resolved" ? "Resolved" : "Dismissed"}</Badge> : null}
            {f.requiresHumanReview && f.humanReview === "pending" ? <Badge tone="review">Human review needed</Badge> : null}
          </div>
          <h4 className="font-medium leading-snug">{f.title}</h4>
        </div>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
          <p className="leading-relaxed text-foreground/90">{f.explanation}</p>
          {f.recommendation ? (
            <p className="rounded-md bg-muted px-3 py-2 text-foreground/90">
              <span className="font-medium">Suggested step: </span>
              {f.recommendation}
            </p>
          ) : null}
          {sources.length ? (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source evidence</div>
              <ul className="space-y-1.5">
                {sources.slice(0, 6).map((s, i) => (
                  <li key={i} className="rounded-md border border-border px-3 py-2 text-xs">
                    <span className="font-medium">{s.evidenceTitle}</span>
                    {s.locator ? <span className="text-muted-foreground"> · {s.locator}</span> : null}
                    {s.excerpt ? <blockquote className="mt-1 border-l-2 border-teal pl-2 italic text-muted-foreground">{s.excerpt}</blockquote> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {f.citationUrl ? (
            <a href={f.citationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue hover:underline">
              <Scale className="size-3.5" aria-hidden /> {f.citationLabel} {f.ruleVersion ? `(rule v${f.ruleVersion})` : ""} <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
          {f.resolutionNote ? <p className="text-xs text-ok">{f.resolutionNote}</p> : null}
          {f.humanReviewNote ? <p className="text-xs text-muted-foreground">Your note: {f.humanReviewNote}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-muted-foreground">First detected {formatDateTime(f.firstDetectedAt)}</span>
            {!readOnly ? (
              <div className="flex flex-wrap gap-1.5">
                {f.lifecycle === "active" ? (
                  <>
                    {f.requiresHumanReview ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => review("confirmed")}>Mark reviewed</Button>
                    ) : null}
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => review("disputed")}>I disagree</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => review("dismissed")}>Dismiss</Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => review("reopen")}>Reopen</Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
