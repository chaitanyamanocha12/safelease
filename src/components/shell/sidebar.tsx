"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, Bookmark, Building2, ClipboardCheck, Columns3, Compass, FileDown, FileText, FolderLock, LayoutDashboard, PiggyBank, Scale, Search, Settings, ShieldCheck, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, type NavIcon } from "./nav-config";
import type { MessageKey } from "@/lib/i18n/dictionaries";

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard, search: Search, compass: Compass, columns: Columns3, bookmark: Bookmark, "file-text": FileText, clipboard: ClipboardCheck,
  wrench: Wrench, piggy: PiggyBank, scale: Scale, folder: FolderLock, "file-down": FileDown, bell: Bell, building: Building2, shield: ShieldCheck, settings: Settings,
};

export function SidebarNav({ labels, showOrg, showAdmin, onNavigate }: { labels: Record<string, string>; showOrg: boolean; showAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = (k: MessageKey) => labels[k] ?? k;
  const extra = [
    ...(showOrg ? [{ href: "/organization", key: "nav.organization" as MessageKey, icon: "building" as NavIcon }] : []),
    ...(showAdmin ? [{ href: "/admin", key: "nav.admin" as MessageKey, icon: "shield" as NavIcon }] : []),
    { href: "/settings", key: "nav.settings" as MessageKey, icon: "settings" as NavIcon },
  ];
  const groups = [...NAV_GROUPS, { key: "nav.settings" as MessageKey, items: extra }];
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((g, gi) => (
        <div key={gi}>
          {gi < NAV_GROUPS.length ? <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{t(g.key)}</div> : <div className="mb-2 h-px bg-border" />}
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      active && "bg-accent text-accent-foreground hover:bg-accent",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {t(item.key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
