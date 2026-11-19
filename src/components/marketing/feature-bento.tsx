import { Camera, Check, X } from "lucide-react";
import AnimatedContent from "@/components/reactbits/AnimatedContent/AnimatedContent";
import { cn } from "@/lib/utils";

/**
 * Visual-first feature bento. Each tile is a picture with a two-word title and one line —
 * the visual carries the idea, the text just names it. Example data is fictional.
 */

function Tile({ title, text, className, art, children }: { title: string; text: string; className?: string; art?: string; children: React.ReactNode }) {
  return (
    <div className={cn("group relative flex min-h-[22rem] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card transition-all duration-500 hover:-translate-y-1 hover:shadow-elevated", className)}>
      <div aria-hidden className={cn("relative flex flex-1 items-center justify-center overflow-hidden p-6", art)}>
        {children}
      </div>
      <div className="p-6 pt-0">
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function PriceCard({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className={cn("w-40 rounded-2xl border bg-card p-4 shadow-elevated sm:w-48", bad ? "border-bad/40" : "border-border")}>
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
      <div className={cn("mt-2 font-display text-4xl tracking-tight sm:text-5xl", bad && "text-bad")}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">per month</div>
    </div>
  );
}

function Contradiction() {
  return (
    <div className="flex items-center gap-3 sm:gap-6">
      <div className="-rotate-3 transition-transform duration-500 group-hover:-rotate-6"><PriceCard label="The ad" value="$1,600" /></div>
      <div className="z-10 flex size-11 shrink-0 items-center justify-center rounded-full bg-bad text-xl font-bold text-white shadow-[0_0_0_6px_var(--bad-bg),0_8px_24px_-4px_rgb(185_28_28/0.6)]">≠</div>
      <div className="rotate-3 transition-transform duration-500 group-hover:rotate-6"><PriceCard label="The lease" value="$1,850" bad /></div>
    </div>
  );
}

function Half() {
  return (
    <div className="text-center">
      <div className="text-gradient font-display text-[9rem] leading-none tracking-tight">½</div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">month&apos;s rent · max deposit</div>
    </div>
  );
}

function Checklist() {
  const items = [
    { t: "Amount matches the lease", ok: true },
    { t: "Recipient is the advertiser", ok: false },
    { t: "Seen the unit in person", ok: true },
  ];
  return (
    <ul className="w-full max-w-xs space-y-2">
      {items.map((i, n) => (
        <li key={i.t} style={{ marginLeft: n * 12 }} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm shadow-card">
          <span className={cn("flex size-5 items-center justify-center rounded-full", i.ok ? "bg-ok text-white" : "bg-bad text-white")}>
            {i.ok ? <Check className="size-3" /> : <X className="size-3" />}
          </span>
          {i.t}
        </li>
      ))}
    </ul>
  );
}

function MapPins() {
  const pins = [
    { x: "22%", y: "28%", p: "$1,450" },
    { x: "62%", y: "20%", p: "$1,720" },
    { x: "40%", y: "58%", p: "$1,390", sel: true },
    { x: "76%", y: "64%", p: "$1,610" },
  ];
  return (
    <div className="absolute inset-0">
      <svg className="absolute inset-0 size-full text-teal/25" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d="M-5 72 Q30 50 52 66 T105 38" fill="none" stroke="currentColor" strokeWidth="5" />
        <path d="M24 -5 Q32 50 20 105" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <path d="M60 -5 Q70 40 88 105" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {pins.map((p) => (
        <span key={p.p} style={{ left: p.x, top: p.y }} className={cn("price-pin absolute -translate-x-1/2 transition-transform duration-300 group-hover:scale-110", p.sel && "selected")}>
          {p.p}
        </span>
      ))}
    </div>
  );
}

function Polaroids() {
  const shots = [
    { room: "Kitchen", rot: "-rotate-6", tint: "from-amber-200 to-orange-300 dark:from-amber-500/40 dark:to-orange-600/40" },
    { room: "Bathroom", rot: "rotate-2", tint: "from-sky-200 to-teal-300 dark:from-sky-500/40 dark:to-teal-600/40" },
    { room: "Bedroom", rot: "rotate-8", tint: "from-violet-200 to-pink-300 dark:from-violet-500/40 dark:to-pink-600/40" },
  ];
  return (
    <div className="flex -space-x-6">
      {shots.map((s) => (
        <div key={s.room} className={cn("w-28 rounded-md bg-white p-2 pb-6 shadow-elevated transition-transform duration-500 group-hover:rotate-0 dark:bg-[#1c2230]", s.rot)}>
          <div className={cn("flex aspect-square items-center justify-center rounded-sm bg-gradient-to-br", s.tint)}>
            <Camera className="size-6 text-black/30 dark:text-white/40" />
          </div>
          <div className="mt-2 text-center font-mono text-[9px] text-neutral">{s.room} · Sep 1</div>
        </div>
      ))}
    </div>
  );
}

const ART = {
  red: "bg-[radial-gradient(ellipse_at_center,var(--bad-bg),transparent_70%)]",
  teal: "bg-[radial-gradient(ellipse_at_center,var(--accent),transparent_70%)]",
  grid: "bg-grid",
};

export function FeatureBento() {
  return (
    <AnimatedContent stagger={0.08} distance={32} duration={0.8} className="mt-14 grid gap-4 lg:grid-cols-6">
      <Tile className="lg:col-span-4" art={ART.red} title="Catch contradictions" text="Every claim compared across the ad, the messages and the lease.">
        <Contradiction />
      </Tile>
      <Tile className="lg:col-span-2" art={ART.teal} title="Know the rules" text="Checked against cited Nova Scotia tenancy rules.">
        <Half />
      </Tile>
      <Tile className="lg:col-span-2" art={ART.teal} title="Pay with eyes open" text="A checklist before any money moves.">
        <Checklist />
      </Tile>
      <Tile className="lg:col-span-2" art={ART.grid} title="Find better options" text="Nearby rentals on a map, ranked with reasons.">
        <MapPins />
      </Tile>
      <Tile className="lg:col-span-2" art={ART.teal} title="Protect your deposit" text="Dated, room-by-room move-in photos.">
        <Polaroids />
      </Tile>
    </AnimatedContent>
  );
}
