import Link from "next/link";
import { Bell, FlaskConical, Plus } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { organizationMembership } from "@/server/db/schema";
import { unreadCount } from "@/server/services/notifications";
import { getLocale } from "@/lib/i18n/server";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { Logo } from "@/components/logo";
import { SidebarNav } from "@/components/shell/sidebar";
import { MobileNav } from "@/components/shell/mobile-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const locale = await getLocale();
  const labels = DICTIONARIES[locale];
  const [unread, memberships] = await Promise.all([
    unreadCount(user.id),
    db.select({ role: organizationMembership.role }).from(organizationMembership).where(and(eq(organizationMembership.userId, user.id), eq(organizationMembership.status, "active"))),
  ]);
  const showOrg = memberships.some((m) => m.role === "org_admin" || m.role === "adviser") || user.role === "platform_admin";
  const showAdmin = user.role === "platform_admin";
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar px-3 py-4 lg:flex">
        <div className="mb-6 px-2">
          <Logo href="/dashboard" />
        </div>
        <SidebarNav labels={labels} showOrg={showOrg} showAdmin={showAdmin} />
        <div className="mt-auto rounded-lg border border-border bg-card/60 p-3 text-xs leading-relaxed text-muted-foreground">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground/80"><span className="size-1.5 rounded-full bg-teal-strong" /> Decision support</div>
          Not a lawyer, registry or landlord certification.
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/70 bg-background/75 px-4 backdrop-blur-xl backdrop-saturate-150">
          <MobileNav labels={labels} showOrg={showOrg} showAdmin={showAdmin} />
          <div className="lg:hidden">
            <Logo href="/dashboard" />
          </div>
          {user.isDemo ? (
            <span className="hidden items-center gap-1 rounded-full border border-warn/40 bg-warn-bg px-2.5 py-1 text-xs font-semibold text-warn sm:inline-flex">
              <FlaskConical className="size-3.5" aria-hidden /> Demo account · fictional data
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            <Button asChild size="sm" variant="teal" className="hidden sm:inline-flex">
              <Link href="/investigations/new">
                <Plus /> {labels["common.newInvestigation"]}
              </Link>
            </Button>
            <LanguageToggle locale={locale} />
            <ThemeToggle />
            <Button asChild variant="ghost" size="icon" aria-label={`${labels["nav.notifications"]}${unread ? ` (${unread} unread)` : ""}`}>
              <Link href="/notifications" className="relative">
                <Bell />
                {unread > 0 ? <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-bad text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span> : null}
              </Link>
            </Button>
            <UserMenu name={user.name} email={user.email} signOutLabel={labels["nav.signOut"]} isAdmin={showAdmin} />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
