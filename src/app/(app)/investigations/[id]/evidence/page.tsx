import Link from "next/link";
import { FileImage, FileText, Info } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getBoard } from "@/server/services/board";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/misc";
import { EvidenceForm } from "@/components/investigation/evidence-form";
import { formatDateTime, titleCase } from "@/lib/utils";

const PROVENANCE: Record<string, string> = {
  user_supplied: "You supplied this text",
  url_fetch: "Fetched from a public page",
  ocr_local: "Text read by on-server OCR",
  ocr_provider: "Text read by an OCR provider",
  llm_vision: "Text transcribed by AI vision",
  pdf_text: "Text extracted from the PDF",
  provider: "From a provider",
};

export default async function EvidencePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const b = await getBoard(user.id, id);
  const superseded = new Set(b.evidence.map((e) => e.supersedesEvidenceId).filter(Boolean) as string[]);
  const supersededBy = new Map(b.evidence.filter((e) => e.supersedesEvidenceId).map((e) => [e.supersedesEvidenceId!, e.title]));
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card className="h-fit lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle>Add evidence</CardTitle>
          <CardDescription>Everything you add is kept. New versions never overwrite earlier evidence.</CardDescription>
        </CardHeader>
        <CardContent>
          {sp.new ? <Callout tone="info" className="mb-4" icon={<Info />}>Start with the listing — paste its text or upload a screenshot. Then add any messages from the landlord.</Callout> : null}
          <EvidenceForm investigationId={id} existing={b.evidence.map((e) => ({ id: e.id, title: e.title, kind: e.kind, superseded: superseded.has(e.id) }))} />
        </CardContent>
      </Card>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Evidence collected ({b.evidence.length})</h2>
        {b.evidence.length === 0 ? <p className="text-sm text-muted-foreground">Nothing added yet.</p> : null}
        {[...b.evidence].reverse().map((e) => {
          const n = b.claims.filter((c) => c.evidenceId === e.id).length;
          return (
            <Card key={e.id} className={superseded.has(e.id) ? "opacity-70" : undefined}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {e.file?.mimeType.startsWith("image/") ? <FileImage className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate font-medium">{e.title}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge tone="outline">{titleCase(e.kind)}</Badge>
                    {superseded.has(e.id) ? <Badge tone="neutral">Superseded by “{supersededBy.get(e.id)}”</Badge> : null}
                    {e.processingStatus === "pending" ? <Badge tone="info">Awaiting analysis</Badge> : null}
                    {e.processingStatus === "failed" ? <Badge tone="warn">Could not process</Badge> : null}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Added {formatDateTime(e.createdAt)}{e.occurredAt ? ` · dated ${formatDateTime(e.occurredAt)}` : ""} · {PROVENANCE[e.provenance] ?? e.provenance} · {n} statement(s) extracted
                </p>
                {e.processingNote ? <p className="text-xs text-muted-foreground">{e.processingNote}</p> : null}
                {e.sourceUrl ? <a href={e.sourceUrl} rel="noopener noreferrer nofollow" target="_blank" className="block truncate text-xs text-blue hover:underline">{e.sourceUrl}</a> : null}
                {e.file ? (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <Link href={`/api/files/${e.documentVersionId}`} className="text-blue hover:underline" target="_blank">View original file ({e.file.fileName})</Link>
                    <span className="text-muted-foreground">Text extraction: {e.file.extractionStatus.replace("_", " ")}</span>
                  </div>
                ) : null}
                {e.file?.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${e.documentVersionId}`} alt={`Uploaded evidence: ${e.title}`} className="max-h-48 rounded-md border border-border object-contain" loading="lazy" />
                ) : null}
                {e.textContent ? (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Show text</summary>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-sans text-xs leading-relaxed">{e.textContent}</pre>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
