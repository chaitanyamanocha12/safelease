"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "./helpers";
import { requireApiUser } from "../auth/session";
import { AppError, toActionError, type ActionResult } from "../errors";
import { validateUpload } from "../security/upload";
import { DOCUMENT_TYPES } from "../db/schema";
import * as D from "../services/documents";
import { rateLimit } from "../security/rate-limit";

export async function uploadDocumentAction(fd: FormData): Promise<ActionResult<{ ids: string[] }>> {
  try {
    const u = await requireApiUser();
    await rateLimit(`upload:${u.id}`, 30, 60_000);
    const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new AppError("VALIDATION", "Choose at least one file.");
    const docType = z.enum(DOCUMENT_TYPES).parse(fd.get("docType") ?? "other");
    const tags = String(fd.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    const ids: string[] = [];
    for (const f of files.slice(0, 12)) {
      const up = await validateUpload(f);
      const r = await D.storeDocument({ ownerId: u.id, upload: up, title: String(fd.get("title") || up.fileName), docType, tags });
      ids.push(r.documentId);
    }
    revalidatePath("/documents");
    return { ok: true, data: { ids } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function newVersionAction(fd: FormData): Promise<ActionResult<null>> {
  try {
    const u = await requireApiUser();
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) throw new AppError("VALIDATION", "Choose a file.");
    await D.addDocumentVersion(u.id, String(fd.get("documentId")), await validateUpload(f));
    revalidatePath("/documents");
    return { ok: true, data: null };
  } catch (e) {
    return toActionError(e);
  }
}

export const updateDocumentAction = action(z.object({ documentId: z.string(), title: z.string().min(1).max(160), tags: z.string().max(400).optional(), notes: z.string().max(2000).optional(), docType: z.enum(DOCUMENT_TYPES) }), async (u, v) => {
  await D.updateDocumentMeta(u.id, v.documentId, { title: v.title, tags: (v.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean), notes: v.notes ?? null, docType: v.docType });
  revalidatePath("/documents");
  return null;
});

export const documentLifecycleAction = action(z.object({ documentId: z.string(), op: z.enum(["trash", "restore", "purge"]) }), async (u, v) => {
  if (v.op === "trash") await D.softDeleteDocument(u.id, v.documentId);
  else if (v.op === "restore") await D.restoreDocument(u.id, v.documentId);
  else await D.permanentlyDeleteDocument(u.id, v.documentId);
  revalidatePath("/documents");
  return null;
});
