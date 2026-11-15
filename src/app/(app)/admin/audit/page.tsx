import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformAdmin } from "@/server/auth/session";
import { auditLog } from "@/server/services/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { Input, Select } from "@/components/ui/input";
import { AdminNav } from "@/components/shell/admin-nav";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; outcome?: string; page?: string }> }) {
  const admin = await requirePlatformAdmin();
  const sp = await searchParams;
  const { rows, page } = await auditLog(admin, { action: sp.action, outcome: sp.outcome, page: Number(sp.page ?? 1) || 1 });
  return (
    <>
      <PageHeader title="Audit log" description="Security-relevant events. Metadata is redacted; document contents and message bodies are never logged." />
      <AdminNav active="/admin/audit" />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="action" defaultValue={sp.action ?? ""} placeholder="Action prefix (e.g. consent.)" className="w-64" aria-label="Action prefix" />
        <Select name="outcome" defaultValue={sp.outcome ?? ""} className="w-36" aria-label="Outcome"><option value="">All outcomes</option><option value="success">Success</option><option value="denied">Denied</option><option value="error">Error</option></Select>
        <Button type="submit">Filter</Button>
      </form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Time</Th><Th>Actor</Th><Th>Action</Th><Th>Resource</Th><Th>Outcome</Th><Th>Metadata</Th></tr></thead>
            <tbody>{rows.map(({ e, actor }) => <tr key={e.id}><Td className="whitespace-nowrap text-xs">{formatDateTime(e.createdAt)}</Td><Td className="text-xs">{actor ?? "system"}</Td><Td className="font-mono text-xs">{e.action}</Td><Td className="text-xs">{e.resourceType}{e.resourceId ? ` ${e.resourceId.slice(0, 14)}` : ""}</Td><Td><Badge tone={e.outcome === "success" ? "ok" : e.outcome === "denied" ? "warn" : "bad"}>{e.outcome}</Badge></Td><Td className="max-w-64 truncate font-mono text-[11px] text-muted-foreground">{e.metadata ? JSON.stringify(e.metadata) : ""}</Td></tr>)}</tbody>
          </Table>
        </CardContent>
      </Card>
      <nav className="mt-4 flex justify-between text-sm">{page > 1 ? <Link className="text-blue" href={`?page=${page - 1}`}>← Newer</Link> : <span />}{rows.length === 50 ? <Link className="text-blue" href={`?page=${page + 1}`}>Older →</Link> : null}</nav>
    </>
  );
}
