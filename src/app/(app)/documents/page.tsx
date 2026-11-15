import type { Metadata } from "next";
import Link from "next/link";
import { FolderLock, Lock } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getDocumentWithVersions, listDocuments } from "@/server/services/documents";
import { DOCUMENT_TYPES, type DocumentType } from "@/server/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout, EmptyState, PageHeader } from "@/components/ui/misc";
import { Field, Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { DocumentRow } from "@/components/forms/document-row";
import { uploadDocumentAction } from "@/server/actions/documents";
import { titleCase } from "@/lib/utils";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; tag?: string; trash?: string; page?: string; open?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const docType = (DOCUMENT_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as DocumentType) : undefined;
  const res = await listDocuments(user.id, { q: sp.q, docType, tag: sp.tag, trash: sp.trash === "1", page: Number(sp.page ?? 1) || 1 });
  const rows = await Promise.all(
    res.items.map(async (d) => {
      const { versions } = await getDocumentWithVersions(user.id, d.id);
      return {
        id: d.id, title: d.title, docType: d.docType, tags: d.tags, notes: d.notes, currentVersion: d.currentVersion, deletedAt: d.deletedAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString(), isDemo: d.isDemo,
        latest: d.latest ? { id: d.latest.id, fileName: d.latest.fileName, mimeType: d.latest.mimeType, sizeBytes: d.latest.sizeBytes, extractionStatus: d.latest.extractionStatus } : null,
        versions: versions.map((v) => ({ id: v.id, version: v.version, createdAt: v.createdAt.toISOString(), fileName: v.fileName })),
      };
    }),
  );
  return (
    <>
      <PageHeader title="Document vault" description="Private storage for listings, leases, receipts, photos and correspondence." actions={<Button asChild variant="outline"><Link href="/settings/privacy">Export all my data</Link></Button>} />
      <Callout tone="ok" icon={<Lock />} className="mb-6">Files are stored outside public web folders and are only served to you after your session is checked.</Callout>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <form className="flex flex-wrap gap-2" role="search">
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search titles, notes and document text" className="min-w-56 flex-1" aria-label="Search documents" />
            <Select name="type" defaultValue={sp.type ?? ""} className="w-44" aria-label="Filter by type"><option value="">All types</option>{DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
            <Input name="tag" defaultValue={sp.tag ?? ""} placeholder="Tag" className="w-28" aria-label="Filter by tag" />
            {sp.trash ? <input type="hidden" name="trash" value="1" /> : null}
            <Button type="submit">Search</Button>
            <Button asChild variant="ghost"><Link href={sp.trash ? "/documents" : "/documents?trash=1"}>{sp.trash ? "Back to documents" : "Trash"}</Link></Button>
          </form>
          <p className="text-xs text-muted-foreground">{res.total} document(s){sp.trash ? " in trash" : ""}</p>
          {rows.length === 0 ? <EmptyState icon={<FolderLock />} title={sp.trash ? "Trash is empty" : "No documents found"} /> : null}
          {rows.map((d) => <DocumentRow key={d.id} d={d} autoOpen={sp.open === d.id} />)}
          {res.total > res.pageSize ? (
            <nav aria-label="Pagination" className="flex justify-between text-sm">
              {res.page > 1 ? <Link className="text-blue" href={`?${new URLSearchParams({ ...sp, page: String(res.page - 1) } as Record<string, string>)}`}>← Previous</Link> : <span />}
              {res.page * res.pageSize < res.total ? <Link className="text-blue" href={`?${new URLSearchParams({ ...sp, page: String(res.page + 1) } as Record<string, string>)}`}>Next →</Link> : null}
            </nav>
          ) : null}
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>Upload</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={uploadDocumentAction} mode="formdata" success="Uploaded" className="space-y-3">
              <Field label="Files" htmlFor="uf" hint="PDF, PNG, JPEG, WebP or TXT · 20 MB max each"><Input id="uf" name="files" type="file" multiple className="h-auto py-2" /></Field>
              <Field label="Title (optional)" htmlFor="ut"><Input id="ut" name="title" /></Field>
              <Field label="Type" htmlFor="uty"><Select id="uty" name="docType" defaultValue="other">{DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
              <Field label="Tags" htmlFor="utg"><Input id="utg" name="tags" placeholder="lease, 2026" /></Field>
              <SubmitButton variant="teal">Upload</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
