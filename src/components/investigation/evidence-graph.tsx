"use client";
/**
 * Investigation graph rendered from stored records:
 * evidence → claims (extraction), claim ↔ claim (supports / contradicts / updates / corrects),
 * findings → claims. Nodes are keyboard-focusable; selection highlights connections.
 */
import { useMemo, useState } from "react";
import { FileText, Link2 } from "lucide-react";
import { titleCase } from "@/lib/utils";
import { EvidenceStatusBadge, SeverityBadge } from "@/components/status/status-badge";

interface GEvidence { id: string; title: string; kind: string; superseded: boolean }
interface GClaim { id: string; evidenceId: string; claimType: string; value: string; status: string; superseded: boolean; excerpt: string | null; locator: string | null }
interface GLink { fromClaimId: string; toClaimId: string; relation: string; explanation: string | null }
interface GFinding { id: string; title: string; severity: string; label: string; claimIds: string[]; evidenceIds: string[] }

type NodeRef = { kind: "evidence" | "claim" | "finding"; id: string };

const COL = { evidence: 20, claim: 330, finding: 640 };
const NODE_W = { evidence: 220, claim: 230, finding: 250 };
const ROW = 46;

const STATUS_STROKE: Record<string, string> = {
  contradicted: "var(--bad)",
  warning: "var(--warn)",
  supported: "var(--ok)",
  needs_review: "var(--review)",
};

function trunc(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function EvidenceGraph({ evidence, claims, links, findings }: { evidence: GEvidence[]; claims: GClaim[]; links: GLink[]; findings: GFinding[] }) {
  const [selected, setSelected] = useState<NodeRef | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const involved = useMemo(() => new Set([...findings.flatMap((f) => f.claimIds), ...links.filter((l) => l.relation !== "supports").flatMap((l) => [l.fromClaimId, l.toClaimId])]), [findings, links]);

  const visibleClaims = useMemo(
    () => claims.filter((c) => c.claimType !== "listing_title" && (showHistory || !c.superseded) && (showAll || involved.has(c.id))).sort((a, b) => a.claimType.localeCompare(b.claimType)),
    [claims, showHistory, showAll, involved],
  );
  const visibleEvidence = useMemo(() => evidence.filter((e) => showHistory || !e.superseded || visibleClaims.some((c) => c.evidenceId === e.id)), [evidence, showHistory, visibleClaims]);
  const claimIds = new Set(visibleClaims.map((c) => c.id));
  const visibleLinks = links.filter((l) => claimIds.has(l.fromClaimId) && claimIds.has(l.toClaimId) && l.relation !== "supports");
  const supportLinks = links.filter((l) => claimIds.has(l.fromClaimId) && claimIds.has(l.toClaimId) && l.relation === "supports");

  const height = Math.max(visibleClaims.length, visibleEvidence.length, findings.length, 4) * ROW + 40;
  const spread = (n: number, i: number) => (n <= 1 ? height / 2 - 16 : 20 + (i * (height - 72)) / (n - 1));
  const pos = new Map<string, { x: number; y: number; w: number }>();
  visibleEvidence.forEach((e, i) => pos.set(`evidence:${e.id}`, { x: COL.evidence, y: spread(visibleEvidence.length, i), w: NODE_W.evidence }));
  visibleClaims.forEach((c, i) => pos.set(`claim:${c.id}`, { x: COL.claim, y: 20 + i * ROW, w: NODE_W.claim }));
  findings.forEach((f, i) => pos.set(`finding:${f.id}`, { x: COL.finding, y: spread(findings.length, i), w: NODE_W.finding }));

  // Connectivity for highlighting
  const connected = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([`${selected.kind}:${selected.id}`]);
    if (selected.kind === "evidence") {
      claims.filter((c) => c.evidenceId === selected.id).forEach((c) => set.add(`claim:${c.id}`));
      findings.filter((f) => f.evidenceIds.includes(selected.id)).forEach((f) => set.add(`finding:${f.id}`));
    } else if (selected.kind === "claim") {
      const c = claims.find((x) => x.id === selected.id);
      if (c) set.add(`evidence:${c.evidenceId}`);
      links.filter((l) => l.fromClaimId === selected.id || l.toClaimId === selected.id).forEach((l) => {
        set.add(`claim:${l.fromClaimId}`);
        set.add(`claim:${l.toClaimId}`);
      });
      findings.filter((f) => f.claimIds.includes(selected.id)).forEach((f) => set.add(`finding:${f.id}`));
    } else {
      const f = findings.find((x) => x.id === selected.id);
      f?.claimIds.forEach((id) => {
        set.add(`claim:${id}`);
        const c = claims.find((x) => x.id === id);
        if (c) set.add(`evidence:${c.evidenceId}`);
      });
      f?.evidenceIds.forEach((id) => set.add(`evidence:${id}`));
    }
    return set;
  }, [selected, claims, links, findings]);

  const dim = (key: string) => (connected ? !connected.has(key) : false);
  const edge = (a: string, b: string, color: string, dashed?: boolean, key?: string) => {
    const p = pos.get(a);
    const q = pos.get(b);
    if (!p || !q) return null;
    const x1 = p.x + p.w;
    const y1 = p.y + 16;
    const x2 = q.x;
    const y2 = q.y + 16;
    const mx = (x1 + x2) / 2;
    const faded = connected ? !(connected.has(a) && connected.has(b)) : false;
    return <path key={key ?? `${a}-${b}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray={dashed ? "4 3" : undefined} opacity={faded ? 0.08 : 0.55} />;
  };
  const arc = (l: GLink) => {
    const p = pos.get(`claim:${l.fromClaimId}`);
    const q = pos.get(`claim:${l.toClaimId}`);
    if (!p || !q) return null;
    const x = p.x + p.w;
    const y1 = p.y + 16;
    const y2 = q.y + 16;
    const bulge = 40 + Math.min(60, Math.abs(y2 - y1) / 4);
    const color = l.relation === "contradicts" ? "var(--bad)" : l.relation === "corrects" ? "var(--teal)" : "var(--warn)";
    const faded = connected ? !(connected.has(`claim:${l.fromClaimId}`) && connected.has(`claim:${l.toClaimId}`)) : false;
    return (
      <path key={`arc-${l.fromClaimId}-${l.toClaimId}-${l.relation}`} d={`M${x},${y1} C${x + bulge},${y1} ${x + bulge},${y2} ${x},${y2}`} fill="none" stroke={color} strokeWidth={2} opacity={faded ? 0.1 : 0.9}>
        <title>{`${l.relation}: ${l.explanation ?? ""}`}</title>
      </path>
    );
  };

  const nodeProps = (ref: NodeRef, label: string) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": label,
    "aria-pressed": selected?.kind === ref.kind && selected.id === ref.id,
    onClick: () => setSelected((s) => (s && s.kind === ref.kind && s.id === ref.id ? null : ref)),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setSelected((s) => (s && s.kind === ref.kind && s.id === ref.id ? null : ref));
      }
    },
    className: "cursor-pointer outline-none focus-visible:[&>rect]:stroke-[var(--ring)] focus-visible:[&>rect]:stroke-[3]",
  });

  const sel = selected;
  const selEvidence = sel?.kind === "evidence" ? evidence.find((e) => e.id === sel.id) : null;
  const selClaim = sel?.kind === "claim" ? claims.find((c) => c.id === sel.id) : null;
  const selFinding = sel?.kind === "finding" ? findings.find((f) => f.id === sel.id) : null;

  if (evidence.length === 0) return <p className="text-sm text-muted-foreground">The graph appears once evidence has been added and analyzed.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3" aria-hidden>
          <span className="flex items-center gap-1"><span className="h-0.5 w-5 bg-bad" /> contradicts</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-5 bg-warn" /> changed between messages</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-5 bg-teal" /> your correction</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-5 border-t border-dashed border-ok" /> consistent</span>
        </div>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all statements
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} /> Show superseded history
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-muted/30">
        <svg viewBox={`0 0 ${COL.finding + NODE_W.finding + 20} ${height}`} className="min-w-[860px]" role="group" aria-label={`Investigation graph: ${visibleEvidence.length} evidence items, ${visibleClaims.length} statements, ${findings.length} findings. Select a node to see its connections.`}>
          <text x={COL.evidence} y={12} className="fill-muted-foreground text-[11px] font-semibold uppercase">Evidence</text>
          <text x={COL.claim} y={12} className="fill-muted-foreground text-[11px] font-semibold uppercase">Statements (claims)</text>
          <text x={COL.finding} y={12} className="fill-muted-foreground text-[11px] font-semibold uppercase">Findings</text>
          {visibleClaims.map((c) => edge(`evidence:${c.evidenceId}`, `claim:${c.id}`, "var(--muted-foreground)"))}
          {findings.flatMap((f) => f.claimIds.filter((id) => claimIds.has(id)).map((id) => edge(`claim:${id}`, `finding:${f.id}`, f.severity === "serious" ? "var(--bad)" : f.severity === "caution" ? "var(--warn)" : "var(--info)", false, `f-${f.id}-${id}`)))}
          {supportLinks.map((l) => {
            const p = pos.get(`claim:${l.fromClaimId}`);
            const q = pos.get(`claim:${l.toClaimId}`);
            if (!p || !q) return null;
            return <path key={`s-${l.fromClaimId}-${l.toClaimId}`} d={`M${p.x},${p.y + 16} C${p.x - 30},${p.y + 16} ${q.x - 30},${q.y + 16} ${q.x},${q.y + 16}`} fill="none" stroke="var(--ok)" strokeDasharray="4 3" strokeWidth={1.2} opacity={connected ? 0.1 : 0.6} />;
          })}
          {visibleLinks.map(arc)}
          {visibleEvidence.map((e) => {
            const p = pos.get(`evidence:${e.id}`)!;
            return (
              <g key={e.id} transform={`translate(${p.x},${p.y})`} opacity={dim(`evidence:${e.id}`) ? 0.25 : e.superseded ? 0.6 : 1} {...nodeProps({ kind: "evidence", id: e.id }, `Evidence: ${e.title}`)}>
                <rect width={p.w} height={32} rx={8} fill="var(--card)" stroke="var(--border)" strokeWidth={1.5} />
                <text x={10} y={20} className="fill-foreground text-[12px] font-medium">{trunc(e.title, 28)}</text>
                {e.superseded ? <text x={p.w - 8} y={20} textAnchor="end" className="fill-muted-foreground text-[10px]">older</text> : null}
              </g>
            );
          })}
          {visibleClaims.map((c) => {
            const p = pos.get(`claim:${c.id}`)!;
            return (
              <g key={c.id} transform={`translate(${p.x},${p.y})`} opacity={dim(`claim:${c.id}`) ? 0.25 : c.superseded ? 0.55 : 1} {...nodeProps({ kind: "claim", id: c.id }, `${titleCase(c.claimType)}: ${c.value}, status ${c.status}`)}>
                <rect width={p.w} height={32} rx={8} fill="var(--card)" stroke={STATUS_STROKE[c.status] ?? "var(--border)"} strokeWidth={c.status === "contradicted" ? 2 : 1.5} />
                <text x={10} y={13} className="fill-muted-foreground text-[9.5px] uppercase">{titleCase(c.claimType)}</text>
                <text x={10} y={26} className="fill-foreground text-[11.5px] font-medium">{trunc(c.value, 30)}</text>
              </g>
            );
          })}
          {findings.map((f) => {
            const p = pos.get(`finding:${f.id}`)!;
            const stroke = f.severity === "serious" ? "var(--bad)" : f.severity === "caution" ? "var(--warn)" : "var(--info)";
            return (
              <g key={f.id} transform={`translate(${p.x},${p.y})`} opacity={dim(`finding:${f.id}`) ? 0.25 : 1} {...nodeProps({ kind: "finding", id: f.id }, `Finding (${f.severity}): ${f.title}`)}>
                <rect width={p.w} height={32} rx={8} fill="var(--card)" stroke={stroke} strokeWidth={2} />
                <rect width={5} height={32} rx={2} fill={stroke} />
                <text x={12} y={20} className="fill-foreground text-[11.5px] font-medium">{trunc(f.title, 34)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div aria-live="polite" className="min-h-16 rounded-lg border border-border p-3 text-sm">
        {selEvidence ? (
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
            <div>
              <div className="font-medium">{selEvidence.title}</div>
              <div className="text-xs text-muted-foreground">{titleCase(selEvidence.kind)}{selEvidence.superseded ? " · superseded by a newer version (preserved)" : ""} · {claims.filter((c) => c.evidenceId === selEvidence.id).length} statement(s)</div>
            </div>
          </div>
        ) : selClaim ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{titleCase(selClaim.claimType)}: {selClaim.value}</span><EvidenceStatusBadge status={selClaim.status} /></div>
            {selClaim.excerpt ? <blockquote className="border-l-2 border-teal pl-2 text-xs italic text-muted-foreground">{selClaim.excerpt}</blockquote> : null}
            <div className="text-xs text-muted-foreground">From {evidence.find((e) => e.id === selClaim.evidenceId)?.title} {selClaim.locator ? `· ${selClaim.locator}` : ""}</div>
            {links.filter((l) => l.fromClaimId === selClaim.id || l.toClaimId === selClaim.id).map((l, i) => (
              <div key={i} className="flex items-center gap-1 text-xs"><Link2 className="size-3" aria-hidden /> {l.relation}: {l.explanation}</div>
            ))}
          </div>
        ) : selFinding ? (
          <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={selFinding.severity} /><EvidenceStatusBadge status={selFinding.label} /><span className="font-medium">{selFinding.title}</span></div>
        ) : (
          <p className="text-muted-foreground">Select any node to trace where a statement came from and which findings depend on it.</p>
        )}
      </div>
    </div>
  );
}
