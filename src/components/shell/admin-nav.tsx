import Link from "next/link";
import { cn } from "@/lib/utils";
export function AdminNav({ active }: { active: string }) {
  const tabs = [["/admin", "Overview"], ["/admin/providers", "Providers"], ["/admin/rules", "Legal rules"], ["/admin/sources", "Sources"], ["/admin/health", "Health & jobs"], ["/admin/audit", "Audit log"]];
  return (
    <nav aria-label="Admin" className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map(([h, l]) => <Link key={h} href={h!} aria-current={active === h ? "page" : undefined} className={cn("relative whitespace-nowrap px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground", active === h && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-teal-strong")}>{l}</Link>)}
    </nav>
  );
}
