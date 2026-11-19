import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} {...p} />;
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn("border-border", className)} />;
}

export function Progress({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-teal-strong transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{children}</kbd>;
}

export function Table({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full text-sm", className)} {...p} />
    </div>
  );
}
export function Th({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("border-b border-border px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground", className)} {...p} />;
}
export function Td({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-border px-3 py-2.5 align-top", className)} {...p} />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-input bg-[radial-gradient(ellipse_at_top,var(--accent),transparent_70%)] px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 rounded-xl border border-border bg-card p-3 text-teal shadow-card [&_svg]:size-6">{icon}</div> : null}
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-2">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[1.7rem]">{title}</h1>
        {description ? <div className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Callout({ tone = "info", title, children, icon, className }: { tone?: "info" | "warn" | "bad" | "ok" | "neutral"; title?: string; children: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-info/25 bg-info-bg text-info",
    warn: "border-warn/30 bg-warn-bg text-warn",
    bad: "border-bad/30 bg-bad-bg text-bad",
    ok: "border-ok/30 bg-ok-bg text-ok",
    neutral: "border-border bg-muted text-muted-foreground",
  } as const;
  return (
    <div role={tone === "bad" ? "alert" : "note"} className={cn("flex gap-3 rounded-lg border p-3 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0", tones[tone], className)}>
      {icon}
      <div className="min-w-0 text-foreground/90">
        {title ? <p className="font-semibold text-current">{title}</p> : null}
        <div className="text-foreground/80">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-elevated">
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-teal-strong/10 blur-2xl transition-colors group-hover:bg-teal-strong/20" />
      <div className="relative flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        {icon ? <span className="flex size-7 items-center justify-center rounded-md border border-border bg-muted/60 text-teal [&_svg]:size-3.5">{icon}</span> : null}
      </div>
      <div className="relative mt-2 text-3xl font-semibold tabular-nums tracking-[-0.03em]">{value}</div>
      {hint ? <div className="relative mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
