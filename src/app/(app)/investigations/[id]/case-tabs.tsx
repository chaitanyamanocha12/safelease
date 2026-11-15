"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function CaseTabs({ id, counts }: { id: string; counts: Record<string, number> }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/investigations/${id}`, label: "Board" },
    { href: `/investigations/${id}/evidence`, label: "Evidence", count: counts.evidence },
    { href: `/investigations/${id}/verification`, label: "Verification" },
    { href: `/investigations/${id}/communications`, label: "Communications", count: counts.drafts },
    { href: `/investigations/${id}/documents`, label: "Documents" },
    { href: `/investigations/${id}/timeline`, label: "Timeline" },
  ];
  return (
    <nav aria-label="Investigation sections" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border px-1">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("relative whitespace-nowrap px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground", active && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-teal-strong")}>
            {t.label}
            {t.count ? <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs">{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
