import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/auth/session";
import { listSources } from "@/server/services/admin";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { AdminNav } from "@/components/shell/admin-nav";
import { RunJobsButton } from "@/components/forms/admin-controls";
import { verifySourceAction } from "@/server/actions/admin";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Legal sources" };

export default async function SourcesPage() {
  const admin = await requirePlatformAdmin();
  const sources = await listSources(admin);
  return (
    <>
      <PageHeader title="Official legal sources" description="Availability is checked automatically by the legal-source review job; content changes must be reviewed by a person." />
      <AdminNav active="/admin/sources" />
      <Card>
        <CardContent className="p-0">
          <Table>
            <thead><tr><Th>Source</Th><Th>Status</Th><Th>Verified on</Th><Th>Last availability check</Th><Th>Mark verified</Th></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <Td><a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue hover:underline">{s.title}</a><div className="text-xs text-muted-foreground">{s.publisher} · {s.sourceType.replace("_", " ")}</div><div className="text-xs text-muted-foreground">{s.verificationNote}</div></Td>
                  <Td><Badge tone={s.status === "verified" ? "ok" : "warn"}>{s.status.replace("_", " ")}</Badge></Td>
                  <Td>{s.verifiedOn}</Td>
                  <Td className="text-xs">{s.lastCheckedAt ? `${formatDateTime(s.lastCheckedAt)} · HTTP ${s.lastCheckHttpStatus || "error"}` : "Never"}</Td>
                  <Td><ActionForm action={verifySourceAction} extra={{ id: s.id }} success="Marked verified" className="flex gap-1"><Input name="note" placeholder="What you checked" className="h-8 w-40" aria-label="Verification note" /><SubmitButton size="sm" variant="outline">Verify</SubmitButton></ActionForm></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
      <div className="mt-4"><RunJobsButton label="Run due jobs (includes source availability check when due)" /></div>
    </>
  );
}
