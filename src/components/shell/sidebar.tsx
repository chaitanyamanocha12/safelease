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
    <nav aria-label="Main" className="flex flex-col gap-4">
      {groups.map((g, gi) => (
        <div key={gi}>
          {gi < NAV_GROUPS.length ? <div className="mb-1 px-3 text-[11px] font-medium text-muted-foreground/70">{t(g.key)}</div> : <div className="divider-fade mb-3" />}
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
                      "group relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground/90 transition-colors hover:bg-foreground/[0.04] hover:text-foreground",
                      active && "bg-sidebar-active text-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(16_29_52/0.06)] hover:bg-sidebar-active",
                    )}
                  >
                    {active ? <span aria-hidden className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-teal-strong" /> : null}
                    <Icon className={cn("size-[15px] opacity-70 transition-opacity group-hover:opacity-100", active && "text-teal opacity-100")} aria-hidden />
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
