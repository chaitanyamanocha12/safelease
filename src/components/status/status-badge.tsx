import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, CircleHelp, CloudOff, Eye, FlaskConical, Info, Loader2, PlugZap, Radio, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Evidence-status taxonomy. Icon + text label — never color alone. */
export const EVIDENCE_STATUS_META = {
  supported: { label: "Supported by evidence", short: "Supported", tone: "ok", Icon: CheckCircle2 },
  contradicted: { label: "Contradicted by evidence", short: "Contradicted", tone: "bad", Icon: XCircle },
  warning: { label: "Potential warning sign", short: "Warning sign", tone: "warn", Icon: AlertTriangle },
  unverified: { label: "Unverified", short: "Unverified", tone: "neutral", Icon: CircleHelp },
  not_checked: { label: "Not checked", short: "Not checked", tone: "neutral", Icon: CircleDashed },
  provider_unavailable: { label: "Provider unavailable", short: "Provider unavailable", tone: "neutral", Icon: CloudOff },
  needs_review: { label: "Requires human review", short: "Needs review", tone: "review", Icon: Eye },
} as const;
export type EvidenceStatusKey = keyof typeof EVIDENCE_STATUS_META;

export function EvidenceStatusBadge({ status, short = true }: { status: string; short?: boolean }) {
  const m = EVIDENCE_STATUS_META[status as EvidenceStatusKey] ?? EVIDENCE_STATUS_META.unverified;
  return (
    <Badge tone={m.tone}>
      <m.Icon aria-hidden />
      {short ? m.short : m.label}
    </Badge>
  );
}

export const SEVERITY_META = {
  serious: { label: "Serious", tone: "bad", Icon: AlertOctagon },
  caution: { label: "Caution", tone: "warn", Icon: ShieldAlert },
  info: { label: "Info", tone: "info", Icon: Info },
} as const;

export function SeverityBadge({ severity }: { severity: string }) {
  const m = SEVERITY_META[severity as keyof typeof SEVERITY_META] ?? SEVERITY_META.info;
  return (
    <Badge tone={m.tone}>
      <m.Icon aria-hidden />
      {m.label}
    </Badge>
  );
}

export const PROVIDER_META = {
  LIVE: { label: "LIVE", tone: "ok", Icon: Radio },
  NOT_CONFIGURED: { label: "NOT CONFIGURED", tone: "neutral", Icon: PlugZap },
  UNAVAILABLE: { label: "UNAVAILABLE", tone: "warn", Icon: CloudOff },
  DEMO: { label: "DEMO", tone: "demo", Icon: FlaskConical },
  ERROR: { label: "ERROR", tone: "bad", Icon: XCircle },
} as const;

export function ProviderBadge({ status }: { status: string }) {
  const m = PROVIDER_META[status as keyof typeof PROVIDER_META] ?? PROVIDER_META.NOT_CONFIGURED;
  return (
    <Badge tone={m.tone}>
      <m.Icon aria-hidden />
      {m.label}
    </Badge>
  );
}

export const TOOL_STATUS_META = {
  running: { label: "Running", tone: "info", Icon: Loader2 },
  succeeded: { label: "Completed", tone: "ok", Icon: CheckCircle2 },
  failed: { label: "Failed", tone: "bad", Icon: XCircle },
  skipped: { label: "Skipped", tone: "neutral", Icon: CircleDashed },
  not_configured: { label: "Not configured", tone: "neutral", Icon: PlugZap },
  provider_unavailable: { label: "Provider unavailable", tone: "warn", Icon: CloudOff },
  budget_exceeded: { label: "Budget reached", tone: "warn", Icon: AlertTriangle },
  cancelled: { label: "Cancelled", tone: "neutral", Icon: XCircle },
} as const;

export function ToolStatusBadge({ status }: { status: string }) {
  const m = TOOL_STATUS_META[status as keyof typeof TOOL_STATUS_META] ?? TOOL_STATUS_META.skipped;
  return (
    <Badge tone={m.tone}>
      <m.Icon aria-hidden className={status === "running" ? "animate-spin" : undefined} />
      {m.label}
    </Badge>
  );
}

export function ModeBadge({ mode }: { mode: string }) {
  const map: Record<string, { label: string; tone: "ok" | "info" | "demo" | "neutral" | "teal" }> = {
    LIVE: { label: "Live provider", tone: "ok" },
    LLM: { label: "AI (LLM)", tone: "teal" },
    DETERMINISTIC: { label: "Deterministic", tone: "info" },
    LOCAL: { label: "Local", tone: "info" },
    DEMO: { label: "DEMO data", tone: "demo" },
    NONE: { label: "No provider", tone: "neutral" },
  };
  const m = map[mode] ?? map.NONE!;
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function DemoBadge({ label = "DEMO" }: { label?: string }) {
  return (
    <Badge tone="demo" title="Fictional demonstration data — not a real or available rental">
      <FlaskConical aria-hidden />
      {label}
    </Badge>
  );
}
