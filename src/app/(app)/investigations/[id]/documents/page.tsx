import Link from "next/link";
import { FolderLock } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getInvestigationForUser } from "@/server/services/investigations";
import { listDocuments } from "@/server/services/documents";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Table, Td, Th } from "@/components/ui/misc";
import { formatDateTime, titleCase } from "@/lib/utils";

export default async function CaseDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  await getInvestigationForUser(user.id, id);
  const docs = await listDocuments(user.id, { investigationId: id, pageSize: 100 });
  if (docs.items.length === 0) return <EmptyState icon={<FolderLock />} title="No files in this case" description="Uploaded screenshots, photos and leases appear here and in your private Document vault." />;
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <thead><tr><Th>Document</Th><Th>Type</Th><Th>Versions</Th><Th>Text</Th><Th>Uploaded</Th><Th><span className="sr-only">Open</span></Th></tr></thead>
          <tbody>
            {docs.items.map((d) => (
              <tr key={d.id}>
                <Td className="font-medium">{d.title}</Td>
                <Td><Badge tone="outline">{titleCase(d.docType)}</Badge></Td>
                <Td>{d.currentVersion}</Td>
                <Td className="text-xs text-muted-foreground">{d.latest?.extractionStatus.replace("_", " ")}</Td>
                <Td className="text-xs">{formatDateTime(d.createdAt)}</Td>
                <Td><Link href={`/documents?open=${d.id}`} className="text-sm text-blue hover:underline">Open in vault</Link></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  );
}
