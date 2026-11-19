import Link from "next/link";
import { ArrowRight, ArrowUpRight, Building2, EyeOff, FileSearch, GraduationCap, Lock, MessageSquareText, Quote, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getT } from "@/lib/i18n/server";
import AnimatedContent from "@/components/reactbits/AnimatedContent/AnimatedContent";
import { FeatureBento } from "@/components/marketing/feature-bento";
import { HalifaxHouses, Stars, TARGET_BOX, TARGET_CENTER } from "@/components/marketing/halifax-scene";
import { GrainBackdrop, Marquee, NightAurora, RadarSweep, RotatingWords } from "@/components/marketing/landing-effects";

const STEPS = [
  { icon: FileSearch, title: "Drop it in", text: "A link, a screenshot, the lease, the landlord's messages." },
  { icon: ScanSearch, title: "We dig", text: "Every claim checked against every source and Nova Scotia rules." },
  { icon: MessageSquareText, title: "You decide", text: "Clear evidence and a polite draft. Nothing is sent without you." },
];

const BLIPS = [
  { label: "Rent mismatch", tone: "bg-bad", x: "64%", y: "24%" },
  { label: "Wire-only payment", tone: "bg-warn", x: "18%", y: "38%" },
  { label: "Deposit over limit", tone: "bg-bad", x: "58%", y: "70%" },
  { label: "Address found", tone: "bg-ok", x: "22%", y: "74%" },
];

const TRUST = [
  { icon: Lock, title: "Private by default", text: "Your uploads are served only to you." },
  { icon: Quote, title: "Cited, not guessed", text: "Rules link to official sources." },
  { icon: EyeOff, title: "Never auto-sent", text: "Nothing leaves without your approval." },
];

function Chip({ tone, title, sub, className, delay }: { tone: string; title: string; sub: string; className?: string; delay: string }) {
  return (
    <div className={`sl-pop absolute ${className ?? ""}`} style={{ animationDelay: delay }}>
      <div className="glass glass-dark sl-float flex items-center gap-2.5 rounded-2xl px-3 py-2 text-left sm:px-4 sm:py-2.5" style={{ animationDelay: delay }}>
        <span className={`size-2 shrink-0 rounded-full ${tone} shadow-[0_0_12px_currentColor]`} />
        <div>
          <div className="whitespace-nowrap text-[11px] font-semibold text-white sm:text-sm">{title}</div>
          <div className="whitespace-nowrap font-mono text-[9px] text-white/60 sm:text-[11px]">{sub}</div>
        </div>
      </div>
    </div>
  );
}

function ScanFrame() {
  const b = TARGET_BOX;
  const corner = "absolute size-5 border-teal-strong sm:size-7";
  return (
    <>
      <div aria-hidden className="absolute" style={{ left: `${b.left - 1}%`, width: `${b.width + 2}%`, top: `${b.top - 4}%`, height: `${b.height + 4}%` }}>
        <div className="absolute inset-0 rounded-md bg-teal-strong/[0.07]" />
        <span className={`${corner} left-0 top-0 rounded-tl-md border-l-2 border-t-2`} />
        <span className={`${corner} right-0 top-0 rounded-tr-md border-r-2 border-t-2`} />
        <span className={`${corner} bottom-0 left-0 rounded-bl-md border-b-2 border-l-2`} />
        <span className={`${corner} bottom-0 right-0 rounded-br-md border-b-2 border-r-2`} />
        <Chip tone="bg-bad text-bad" title="Rent doesn't match" sub="$1,600 ad · $1,850 lease" delay="0.9s" className="left-1/2 top-[48%] -translate-x-1/2 sm:hidden" />
        <div className="sl-scan absolute inset-x-0 h-0.5 bg-teal-strong shadow-[0_0_24px_6px_rgb(45_212_191/0.55)]" />
        <div className="glass absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[9px] text-white/80 sm:text-[11px]">
          <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-teal-strong" />investigating · 1180 Barrington St
        </div>
      </div>
      <Chip tone="bg-bad text-bad" title="Rent doesn't match" sub="$1,600 ad · $1,850 lease" delay="0.9s" className="right-[calc(100%-var(--l))] top-[30%] mr-4 hidden sm:block" />
      <Chip tone="bg-warn text-warn" title="Deposit over legal limit" sub="RTA s. 12(2)" delay="1.3s" className="left-[var(--r)] top-[22%] ml-4 hidden sm:block" />
      <Chip tone="bg-ok text-ok" title="Address exists" sub="Halifax, NS" delay="1.7s" className="left-[var(--r)] top-[58%] ml-8 hidden sm:block" />
    </>
  );
}

export default async function LandingPage() {
  const t = await getT();
  return (
    <>
      {/* ───────── Hero: Halifax at night, one house under investigation ───────── */}
      <section className="px-2 pt-2 sm:px-3 sm:pt-3">
        <div className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#060b14] text-white sm:rounded-[2.5rem]">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#0f2a3d,transparent_70%)]" />
          <NightAurora />
          <Stars />
          <div className="relative z-10 mx-auto max-w-4xl px-5 pt-16 text-center sm:pt-24">
            <p className="glass sl-pop mx-auto inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-white/80">
              <span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-strong opacity-70" /><span className="relative size-1.5 rounded-full bg-teal-strong" /></span>
              Rental investigation · Halifax &amp; Nova Scotia
            </p>
            <h1 className="sl-pop mt-7 font-display text-[clamp(3.2rem,10vw,8rem)] leading-[0.92] tracking-[-0.02em]" style={{ animationDelay: "0.15s" }}>
              <span className="sr-only">{t("marketing.tagline")}</span>
              <span aria-hidden className="block">Investigate</span>
              <span aria-hidden className="block"><RotatingWords words={["before you pay.", "before you sign.", "before you move."]} /></span>
            </h1>
            <p className="sl-pop mx-auto mt-6 max-w-md text-base text-white/60 sm:text-lg" style={{ animationDelay: "0.3s" }}>
              Drop in a rental listing. We find what doesn&apos;t add up.
            </p>
            <div className="sl-pop mt-9 flex flex-wrap items-center justify-center gap-3" style={{ animationDelay: "0.45s" }}>
              <Button asChild size="lg" variant="teal" className="h-12 rounded-full px-7 text-[15px]">
                <Link href="/investigations/new">Investigate a rental <ArrowRight /></Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="glass h-12 rounded-full px-6 text-[15px] text-white hover:bg-white/15">
                <Link href="/how-it-works">How it works</Link>
              </Button>
            </div>
          </div>
          <div className="relative mt-20 sm:mt-16">
            <div
              className="relative left-1/2 w-[260%] sm:w-[150%] lg:w-[112%]"
              style={{ transform: `translateX(-${TARGET_CENTER}%)`, ["--l" as string]: `${TARGET_BOX.left - 1}%`, ["--r" as string]: `${TARGET_BOX.left + TARGET_BOX.width + 1}%` }}
            >
              <HalifaxHouses />
              <ScanFrame />
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Marquee ───────── */}
      <section aria-label="What SafeLease checks" className="overflow-hidden py-14 text-foreground/80">
        <Marquee items={["Contradictions", "Deposit limits", "Payment red flags", "Lease clauses", "Move-in photos", "Fake landlords"]} />
      </section>

      {/* ───────── Three steps ───────── */}
      <section className="mx-auto max-w-6xl px-5 pb-28 sm:px-6" aria-labelledby="how">
        <AnimatedContent distance={24} duration={0.8}>
          <span className="eyebrow">How it works</span>
          <h2 id="how" className="mt-4 max-w-2xl font-display text-5xl leading-[1] tracking-tight sm:text-6xl">
            Three steps. <em className="text-teal">Zero guesswork.</em>
          </h2>
        </AnimatedContent>
        <AnimatedContent stagger={0.12} distance={32} duration={0.8} className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-border bg-border md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="group relative bg-card p-8 transition-colors duration-500 hover:bg-accent/40 sm:p-10">
              <div className="text-gradient font-display text-7xl leading-none">0{i + 1}</div>
              <s.icon className="mt-10 size-6 text-teal transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-110" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </AnimatedContent>
      </section>

      {/* ───────── Radar ───────── */}
      <section className="px-2 sm:px-3" aria-labelledby="radar">
        <div className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#060b14] text-white sm:rounded-[2.5rem]">
          <div aria-hidden className="bg-noise pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay" />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 sm:py-28 lg:grid-cols-2">
            <AnimatedContent distance={28} duration={0.9}>
              <span className="eyebrow text-teal-strong">The investigation</span>
              <h2 id="radar" className="mt-4 font-display text-5xl leading-[1] tracking-tight sm:text-7xl">
                We look for<br />what&apos;s <em className="text-teal-strong">off.</em>
              </h2>
              <p className="mt-6 max-w-sm text-white/60">Scams hide in the details — a changed number, a rushed deadline, a stranger&apos;s bank account. We surface them, with receipts.</p>
              <Button asChild variant="ghost" className="glass mt-8 rounded-full px-5 text-white hover:bg-white/15">
                <Link href="/features">Explore features <ArrowUpRight /></Link>
              </Button>
            </AnimatedContent>
            <AnimatedContent distance={40} scale={0.92} duration={1.1} className="relative mx-auto aspect-square w-full max-w-[520px]">
              <div aria-hidden className="absolute inset-0 overflow-hidden rounded-full [mask-image:radial-gradient(circle,black_60%,transparent_71%)]">
                <RadarSweep />
              </div>
              {BLIPS.map((b, i) => (
                <div key={b.label} className="absolute" style={{ left: b.x, top: b.y }}>
                  <div className="glass sl-float flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium" style={{ animationDelay: `${i * 0.7}s` }}>
                    <span className={`size-1.5 rounded-full ${b.tone}`} />
                    {b.label}
                  </div>
                </div>
              ))}
            </AnimatedContent>
          </div>
        </div>
      </section>

      {/* ───────── Features ───────── */}
      <section className="mx-auto max-w-6xl px-5 py-28 sm:px-6" aria-labelledby="features">
        <AnimatedContent distance={24} duration={0.8}>
          <span className="eyebrow">Features</span>
          <h2 id="features" className="mt-4 max-w-3xl font-display text-5xl leading-[1] tracking-tight sm:text-6xl">
            From the listing<br />to the <em className="text-teal">keys.</em>
          </h2>
        </AnimatedContent>
        <FeatureBento />
        <AnimatedContent stagger={0.1} distance={20} duration={0.7} className="mt-16 grid gap-8 border-t border-border pt-12 sm:grid-cols-3">
          {TRUST.map((x) => (
            <div key={x.title} className="flex gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-teal shadow-card"><x.icon className="size-4" aria-hidden /></div>
              <div>
                <h3 className="font-semibold">{x.title}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{x.text}</p>
              </div>
            </div>
          ))}
        </AnimatedContent>
      </section>

      {/* ───────── Audience ───────── */}
      <section className="mx-auto max-w-6xl px-5 pb-28 sm:px-6" aria-labelledby="who">
        <h2 id="who" className="sr-only">Who it&apos;s for</h2>
        <AnimatedContent stagger={0.12} distance={32} duration={0.8} className="grid gap-4 md:grid-cols-2">
          {[
            { href: "/for-students", icon: GraduationCap, kicker: "For renters", title: "Students, newcomers & first-time renters", art: "from-teal-strong/30 via-blue/20 to-transparent" },
            { href: "/for-organizations", icon: Building2, kicker: "For organizations", title: "Universities, unions & tenant-support groups", art: "from-violet-500/30 via-pink-500/15 to-transparent" },
          ].map((a) => (
            <Link key={a.href} href={a.href} className="group relative flex min-h-80 flex-col justify-end overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-card transition-all duration-500 hover:-translate-y-1 hover:shadow-elevated">
              <div aria-hidden className={`absolute -right-20 -top-20 size-80 rounded-full bg-gradient-to-br ${a.art} blur-2xl transition-transform duration-700 group-hover:scale-125`} />
              <a.icon aria-hidden strokeWidth={0.75} className="absolute right-8 top-8 size-32 text-foreground/10 transition-all duration-700 group-hover:rotate-6 group-hover:text-teal/30" />
              <div className="relative">
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-teal">{a.kicker}</span>
                <h3 className="mt-2 max-w-sm font-display text-4xl leading-[1.05] tracking-tight">{a.title}</h3>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium">Learn more <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
              </div>
            </Link>
          ))}
        </AnimatedContent>
      </section>

      {/* ───────── CTA ───────── */}
      <section className="px-2 pb-3 sm:px-3">
        <div className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#05101f] text-center text-white sm:rounded-[2.5rem]">
          <GrainBackdrop />
          <div className="relative z-10 px-6 pt-24 sm:pt-32">
            <h2 className="mx-auto max-w-3xl font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">
              Found a place?<br /><em className="text-teal-strong">Investigate it first.</em>
            </h2>
            <p className="mx-auto mt-5 max-w-sm text-white/65">Two minutes. One listing. Fewer regrets.</p>
            <Button asChild size="lg" className="mt-9 h-12 rounded-full bg-white px-7 text-[15px] text-[#060b14] shadow-[0_8px_32px_-8px_rgb(255_255_255/0.5)] hover:bg-white/90 hover:brightness-100">
              <Link href="/investigations/new">Start an investigation <ArrowRight /></Link>
            </Button>
          </div>
          <div aria-hidden className="relative mt-16 opacity-60 [mask-image:linear-gradient(to_bottom,transparent,black_60%)]">
            <HalifaxHouses className="relative left-1/2 min-w-[900px] -translate-x-1/2" />
          </div>
        </div>
      </section>
    </>
  );
}
