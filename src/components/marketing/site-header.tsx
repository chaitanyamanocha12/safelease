import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { getSessionUser } from "@/server/auth/session";
import { getLocale, getT } from "@/lib/i18n/server";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/features", label: "Features" },
  { href: "/for-students", label: "Students" },
  { href: "/for-organizations", label: "Organizations" },
  { href: "/pricing", label: "Pricing" },
];

export async function SiteHeader() {
  const [user, t, locale] = await Promise.all([getSessionUser(), getT(), getLocale()]);
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Site" className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-foreground">{l.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <LanguageToggle locale={locale} />
          <ThemeToggle />
          {user ? (
            <Button asChild size="sm"><Link href="/dashboard">Dashboard</Link></Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex"><Link href="/login">{t("marketing.signIn")}</Link></Button>
              <Button asChild size="sm"><Link href="/signup">{t("marketing.getStarted")}</Link></Button>
            </>
          )}
        </div>
      </div>
      <nav aria-label="Site (mobile)" className="flex gap-4 overflow-x-auto border-t border-border/60 px-4 py-2 text-sm text-muted-foreground md:hidden">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap hover:text-foreground">{l.label}</Link>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-muted-foreground">Investigate before you pay. Evidence-based rental investigation for Halifax and Nova Scotia.</p>
        </div>
        {[
          { title: "Product", links: [["How it works", "/how-it-works"], ["Features", "/features"], ["Pricing", "/pricing"]] },
          { title: "Who it's for", links: [["Students & newcomers", "/for-students"], ["Organizations", "/for-organizations"], ["About", "/about"]] },
          { title: "Trust", links: [["Privacy", "/privacy"], ["Terms", "/terms"], ["Contact", "/contact"]] },
        ].map((c) => (
          <div key={c.title}>
            <h2 className="mb-3 text-sm font-semibold">{c.title}</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {c.links.map(([l, h]) => (
                <li key={h}><Link href={h!} className="hover:text-foreground">{l}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
        SafeLease provides information, not legal advice, and does not certify landlords. Built for the Cognizant BrAInstorm Challenge 2026.
      </div>
    </footer>
  );
}
