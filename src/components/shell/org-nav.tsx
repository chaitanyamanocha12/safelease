import Link from "next/link";
import { cn } from "@/lib/utils";

export function OrgNav({ orgId, active, isAdmin, orgs }: { orgId: string; active: string; isAdmin: boolean; orgs: Array<{ id: string; name: string }> }) {
  const tabs = [["", "Overview"], ["/cases", "Cases"], ["/analytics", "Analytics"], ...(isAdmin ? [["/team", "Team"], ["/settings", "Settings"]] : [])];
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border">
      <nav aria-label="Organization" className="flex gap-1">
        {tabs.map(([p, l]) => (
          <Link key={p} href={`/organization${p}?org=${orgId}`} aria-current={active === p ? "page" : undefined} className={cn("relative px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground", active === p && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-teal-strong")}>{l}</Link>
        ))}
      </nav>
      {orgs.length > 1 ? <div className="flex gap-2 pb-2 text-xs">{orgs.map((o) => <Link key={o.id} href={`/organization${active}?org=${o.id}`} className={o.id === orgId ? "font-semibold" : "text-blue"}>{o.name}</Link>)}</div> : null}
    </div>
  );
}
