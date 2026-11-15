import { AlertOctagon, Bot, CheckCircle2, CircleHelp, Scale, ShieldQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EvidenceStatusBadge, SeverityBadge, ToolStatusBadge, ModeBadge } from "@/components/status/status-badge";

/** Static illustration built from real app components. Fictional example data. */
export function HeroPreview() {
  return (
    <div className="relative" aria-label="Illustrative example of a SafeLease investigation with fictional data" role="img">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-teal-strong/25 via-blue/15 to-transparent blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-[11px] font-mono text-muted-foreground">SL-7K2Q-9MXA · Halifax</div>
            <div className="font-semibold">South End 2BR — RentFinder ad</div>
          </div>
          <Badge tone="demo">Example · fictional</Badge>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <div className="rounded-lg border border-bad/30 bg-bad-bg p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold text-bad"><AlertOctagon className="size-4" /> 4 serious concerns found</div>
              <p className="mt-1 text-xs text-foreground/80">Do not pay until they are resolved and verified.</p>
            </div>
            {[
              { sev: "serious", label: "contradicted", title: "Monthly rent in the lease differs from the advertisement", meta: "$1,600 in listing · $1,850 in lease (page 1)" },
              { sev: "serious", label: "warning", title: "Rule concern: deposit above half a month's rent", meta: "Residential Tenancies Act, s. 12(2)", icon: Scale },
              { sev: "caution", label: "warning", title: "Payment recipient differs from the advertiser", meta: "“Sarah Whitfield” vs “Daniel Moreau”" },
            ].map((f, i) => (
              <div key={i} className={`rounded-lg border border-border border-l-4 p-3 ${f.sev === "serious" ? "border-l-bad" : "border-l-warn"}`}>
                <div className="mb-1 flex flex-wrap gap-1"><SeverityBadge severity={f.sev} /><EvidenceStatusBadge status={f.label} /></div>
                <div className="text-sm font-medium">{f.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{f.meta}</div>
              </div>
            ))}
            <div className="flex items-start gap-2 rounded-lg border border-border p-3 text-xs">
              <ShieldQuestion className="mt-0.5 size-4 text-neutral" />
              <div><span className="font-semibold">Rental authority has not been independently verified.</span> <span className="text-muted-foreground">An address existing doesn't mean the advertiser may rent it.</span></div>
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><Bot className="size-4 text-teal" /> Agent activity</div>
            {[
              ["Listing extraction", "succeeded", "LOCAL"],
              ["Evidence reconciliation", "succeeded", "DETERMINISTIC"],
              ["Nova Scotia rule check", "succeeded", "DETERMINISTIC"],
              ["Address check", "not_configured", "NONE"],
              ["Prepare landlord message", "succeeded", "DETERMINISTIC"],
            ].map(([t, s, m]) => (
              <div key={t} className="rounded-md border border-border p-2">
                <div className="text-xs font-medium">{t}</div>
                <div className="mt-1 flex flex-wrap gap-1"><ModeBadge mode={m!} /><ToolStatusBadge status={s!} /></div>
              </div>
            ))}
            <div className="pt-1 text-xs text-muted-foreground"><CheckCircle2 className="mr-1 inline size-3 text-ok" />Draft ready — not sent<br /><CircleHelp className="mr-1 inline size-3" />3 questions for the landlord</div>
          </div>
        </div>
      </div>
    </div>
  );
}
