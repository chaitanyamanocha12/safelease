import Link from "next/link";
import { ArrowRight, Bot, Building2, ClipboardCheck, Compass, FileSearch, GraduationCap, Lock, MessageSquare, Scale, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroPreview } from "@/components/marketing/hero-preview";
import { getT } from "@/lib/i18n/server";

const STEPS = [
  { icon: FileSearch, title: "Add what you have", text: "Paste the listing, upload a screenshot or PDF, add the landlord's messages and the lease." },
  { icon: Bot, title: "The agent investigates", text: "It extracts each claim with its source, compares sources, applies Nova Scotia rules and runs available checks." },
  { icon: Scale, title: "See evidence, not guesses", text: "Contradictions, rule concerns and warning signs — each linked to the exact text and official source." },
  { icon: MessageSquare, title: "Act on your terms", text: "Get specific questions and a polite draft message. Nothing is sent without your approval." },
];

const FEATURES = [
  { icon: FileSearch, title: "Investigate listings", text: "Rent, deposit, address, contacts and payment instructions extracted with excerpts and line or page references." },
  { icon: ShieldCheck, title: "Evidence-based verification", text: "Every conclusion is labeled: supported, contradicted, warning sign, unverified, not checked, provider unavailable or needs review." },
  { icon: Scale, title: "Lease protection", text: "Clause-by-clause review against verified Nova Scotia rules — deposit limits, application fees, notice and late-fee guidance." },
  { icon: Compass, title: "Discover nearby rentals", text: "Search alternatives on a map with explainable ranking. Demo inventory and live sources are always labeled." },
  { icon: Wallet, title: "Before-you-pay checklist", text: "Checks the amount, purpose, recipient, timing and verification status before money moves. Never says a payment is “safe”." },
  { icon: ClipboardCheck, title: "Move-in protection", text: "Room-by-room inspection with dated photos, repair tracking, deposit timelines and dispute evidence packages." },
];

const FAQ = [
  ["Can SafeLease tell me if a listing is a scam?", "No tool can know that for certain. SafeLease shows the evidence: contradictions, Nova Scotia rule concerns and known warning signs — and keeps what hasn't been verified clearly visible."],
  ["Does SafeLease verify landlords?", "Not on its own. Nova Scotia's property registry requires paid, authorized access, and ownership doesn't prove someone may rent a unit. SafeLease guides you through independent verification and records what you confirm."],
  ["Is this legal advice?", "No. Rules are summarized from official Nova Scotia sources with links and verification dates. For decisions, contact the Residential Tenancies Program or a legal clinic."],
  ["Can my university see my cases?", "No. Organization accounts never see your cases unless you share a specific case, and you can revoke sharing at any time."],
  ["Does it work without AI?", "Yes. Core checks — rules, calculations, contradictions — are deterministic. When an AI provider is configured it helps with planning, extraction and wording, and it's always labeled."],
];

export default async function LandingPage() {
  const t = await getT();
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-teal-strong" /> Rental investigation for Halifax & Nova Scotia
            </p>
            <h1 className="font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">{t("marketing.tagline")}</h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              SafeLease helps you investigate rental listings, understand your lease, compare alternatives, and protect yourself from costly rental mistakes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="teal">
                <Link href="/investigations/new">{t("marketing.cta.primary")} <ArrowRight /></Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/how-it-works">{t("marketing.cta.secondary")}</Link>
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">Your next home deserves more than a gut feeling.</p>
          </div>
          <HeroPreview />
        </div>
      </section>

      <section className="border-y border-border bg-card py-20" aria-labelledby="how">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 id="how" className="text-3xl font-semibold tracking-tight">How SafeLease works</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">A bounded investigation agent that plans, runs checks, reconciles evidence and asks before acting.</p>
          <ol className="mt-10 grid gap-6 md:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-xl border border-border bg-background p-5">
                <span className="absolute -top-3 left-5 rounded-full bg-navy px-2 py-0.5 text-xs font-semibold text-white dark:bg-teal-strong dark:text-[#04201d]">{i + 1}</span>
                <s.icon className="mb-3 size-6 text-teal" aria-hidden />
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-20" aria-labelledby="features">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 id="features" className="text-3xl font-semibold tracking-tight">Protection from first listing to final deposit</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-card p-6 shadow-card">
                <div className="mb-4 inline-flex rounded-lg bg-accent p-2.5 text-accent-foreground"><f.icon className="size-5" aria-hidden /></div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-navy py-20 text-white" aria-labelledby="who">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 id="who" className="text-3xl font-semibold tracking-tight">Who it's for</h2>
            <p className="mt-3 text-white/70">Built for people renting somewhere new — and the organizations that support them.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link href="/for-students" className="rounded-xl border border-white/15 bg-white/5 p-5 hover:bg-white/10">
              <GraduationCap className="mb-3 size-6 text-teal-strong" aria-hidden />
              <h3 className="font-semibold">Students, newcomers & first-time renters</h3>
              <p className="mt-1 text-sm text-white/70">Understand local rules and verify before paying from across the country — or the world.</p>
            </Link>
            <Link href="/for-organizations" className="rounded-xl border border-white/15 bg-white/5 p-5 hover:bg-white/10">
              <Building2 className="mb-3 size-6 text-teal-strong" aria-hidden />
              <h3 className="font-semibold">Universities, unions & tenant-support groups</h3>
              <p className="mt-1 text-sm text-white/70">Help renters with consent-based case sharing and privacy-protected aggregate insights.</p>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20" aria-labelledby="trust">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <Lock className="mb-3 size-7 text-teal" aria-hidden />
            <h2 id="trust" className="text-3xl font-semibold tracking-tight">Privacy and trust by design</h2>
            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              <li>• Uploads are stored privately and served only to you.</li>
              <li>• Listing text and documents are treated as untrusted data — never as instructions to the AI.</li>
              <li>• Legal checks are deterministic and cite official Nova Scotia sources.</li>
              <li>• Nothing is sent, shared or paid without your explicit approval.</li>
              <li>• Export or permanently delete your data at any time.</li>
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Frequently asked questions</h2>
            <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group p-4">
                  <summary className="cursor-pointer list-none font-medium">{q}</summary>
                  <p className="mt-2 text-sm text-muted-foreground">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-5xl rounded-3xl bg-gradient-to-br from-navy to-[#14325a] p-10 text-center text-white shadow-2xl sm:p-14">
          <h2 className="font-display text-4xl sm:text-5xl">Found a place? Investigate it first.</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/70">It takes a couple of minutes to add a listing and the messages you've received.</p>
          <Button asChild size="lg" variant="teal" className="mt-8"><Link href="/investigations/new">Investigate a rental <ArrowRight /></Link></Button>
        </div>
      </section>
    </>
  );
}
