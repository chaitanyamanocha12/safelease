"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, Pencil, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { documentLifecycleAction, newVersionAction, updateDocumentAction } from "@/server/actions/documents";
import { formatDateTime, titleCase } from "@/lib/utils";

const TYPES = ["listing", "conversation", "lease", "lease_revision", "deposit_receipt", "photo", "inspection_report", "repair", "official_notice", "correspondence", "verification", "other"];

export interface DocRow {
  id: string;
  title: string;
  docType: string;
  tags: string[];
  notes: string | null;
  currentVersion: number;
  deletedAt: string | null;
  createdAt: string;
  isDemo: boolean;
  latest: { id: string; fileName: string; mimeType: string; sizeBytes: number; extractionStatus: string } | null;
  versions: Array<{ id: string; version: number; createdAt: string; fileName: string }>;
}

export function DocumentRow({ d, autoOpen }: { d: DocRow; autoOpen?: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState(Boolean(autoOpen));
  const op = async (o: "trash" | "restore" | "purge") => {
    const r = await documentLifecycleAction({ documentId: d.id, op: o });
    if (!r.ok) return toast.error(r.error);
    toast.success(o === "trash" ? "Moved to trash" : o === "restore" ? "Restored" : "Permanently deleted");
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-medium">{d.title}</span>
          <Badge tone="outline">{titleCase(d.docType)}</Badge>
          {d.currentVersion > 1 ? <Badge tone="info">v{d.currentVersion}</Badge> : null}
          {d.isDemo ? <Badge tone="demo">DEMO</Badge> : null}
          {d.tags.map((t) => <Badge key={t} tone="teal">#{t}</Badge>)}
        </div>
        <div className="text-xs text-muted-foreground">{d.latest?.fileName} · {d.latest ? `${Math.max(1, Math.round(d.latest.sizeBytes / 1024))} KB` : ""} · uploaded {formatDateTime(d.createdAt)} · text {d.latest?.extractionStatus.replace("_", " ")}</div>
      </div>
      <div className="flex flex-wrap gap-1">
        {d.latest ? (
          <>
            <Button asChild size="sm" variant="ghost"><a href={`/api/files/${d.latest.id}`} target="_blank"><Eye /> View</a></Button>
            <Button asChild size="sm" variant="ghost"><a href={`/api/files/${d.latest.id}?download=1`}><Download /> Download</a></Button>
          </>
        ) : null}
        {!d.deletedAt ? (
          <>
            <Dialog open={edit} onOpenChange={setEdit}>
              <DialogTrigger asChild><Button size="sm" variant="ghost"><Pencil /> Edit</Button></DialogTrigger>
              <DialogContent title="Edit document" description="Changes affect labels only; file contents are never altered.">
                <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const r = await updateDocumentAction({ documentId: d.id, title: fd.get("title"), tags: fd.get("tags"), notes: fd.get("notes"), docType: fd.get("docType") }); if (!r.ok) return toast.error(r.error); setEdit(false); router.refresh(); }}>
                  <Field label="Title" htmlFor={`t-${d.id}`}><Input id={`t-${d.id}`} name="title" defaultValue={d.title} /></Field>
                  <Field label="Type" htmlFor={`ty-${d.id}`}><Select id={`ty-${d.id}`} name="docType" defaultValue={d.docType}>{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
                  <Field label="Tags (comma-separated)" htmlFor={`tg-${d.id}`}><Input id={`tg-${d.id}`} name="tags" defaultValue={d.tags.join(", ")} /></Field>
                  <Field label="Notes" htmlFor={`n-${d.id}`}><Textarea id={`n-${d.id}`} name="notes" rows={2} defaultValue={d.notes ?? ""} /></Field>
                  <Button type="submit">Save</Button>
                </form>
                <form className="mt-5 space-y-2 border-t border-border pt-4" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set("documentId", d.id); const r = await newVersionAction(fd); if (!r.ok) return toast.error(r.error); toast.success("New version uploaded"); setEdit(false); router.refresh(); }}>
                  <Field label="Upload a new version" htmlFor={`v-${d.id}`} hint="Earlier versions are kept."><Input id={`v-${d.id}`} name="file" type="file" className="h-auto py-2" /></Field>
                  <Button type="submit" variant="outline" size="sm"><Upload /> Upload version</Button>
                </form>
                {d.versions.length > 1 ? (
                  <ul className="mt-4 space-y-1 text-xs">{d.versions.map((v) => <li key={v.id}><a className="text-blue hover:underline" href={`/api/files/${v.id}`} target="_blank">v{v.version} · {v.fileName}</a> · {formatDateTime(v.createdAt)}</li>)}</ul>
                ) : null}
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="ghost" onClick={() => op("trash")}><Trash2 /> Trash</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => op("restore")}><RotateCcw /> Restore</Button>
            <ConfirmDialog trigger={<Button size="sm" variant="destructive">Delete permanently</Button>} title="Permanently delete this document?" description="The file and all versions are removed from storage. This cannot be undone." destructive confirmLabel="Delete forever" onConfirm={async () => { await op("purge"); }} />
          </>
        )}
      </div>
    </div>
  );
}
