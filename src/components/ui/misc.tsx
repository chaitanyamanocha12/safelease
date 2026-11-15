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
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground [&_svg]:size-6">{icon}</div> : null}
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
        {eyebrow ? <div className="mb-1 text-xs font-medium uppercase tracking-wider text-teal">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
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
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        {icon ? <span className="text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
