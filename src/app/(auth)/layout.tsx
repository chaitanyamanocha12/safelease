import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { CtaThreads } from "@/components/marketing/landing-effects";

const POINTS = [
  "Every claim linked to the exact text it came from",
  "Deterministic checks against cited Nova Scotia rules",
  "Nothing sent, shared or paid without your approval",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,1.05fr)]">
      <div className="relative flex flex-col">
        <div aria-hidden className="absolute inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)] opacity-60" />
        <header className="flex items-center justify-between px-6 py-4">
          <Logo />
          <ThemeToggle />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-md [&>div]:shadow-elevated">{children}</div>
        </main>
      </div>
      <aside aria-hidden className="relative hidden overflow-hidden bg-gradient-to-br from-navy via-[#0f2440] to-[#0c3b45] text-white lg:flex lg:flex-col lg:justify-end">
        <CtaThreads />
        <div className="bg-noise pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay" />
        <div className="pointer-events-none absolute -right-24 top-1/4 size-96 rounded-full bg-teal-strong/25 blur-3xl" />
        <div className="relative p-12 xl:p-16">
          <span className="eyebrow text-teal-strong">SafeLease</span>
          <p className="mt-4 max-w-lg font-display text-5xl leading-[1.05] tracking-tight">
            Your next home deserves more than a <em className="text-teal-strong">gut feeling.</em>
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/75">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <CheckCircle2 className="size-4 shrink-0 text-teal-strong" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
