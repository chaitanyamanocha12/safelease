/**
 * Document vault service. All functions take the acting user's id and scope
 * every query by owner. Missing or foreign documents are reported as
 * NOT_FOUND (never "forbidden") to avoid revealing existence.
 */
import crypto from "node:crypto";
import { and, desc, eq, isNull, isNotNull, like, or, sql, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { document, documentVersion, imageFingerprint, type DocumentType } from "../db/schema";
import { newId } from "@/lib/ids";
import { notFound } from "../errors";
import { storage } from "../storage";
import { extractText, type TextExtraction } from "../extraction/text";
import { fingerprintImage, readImageMetadata } from "../images/fingerprint";
import { isImageKind, type ValidatedUpload } from "../security/upload";
import { audit } from "./audit";

export interface DocumentLinks {
  investigationId?: string | null;
  tenancyId?: string | null;
  maintenanceCaseId?: string | null;
  disputeId?: string | null;
  depositId?: string | null;
}

export interface StoredDocument {
  documentId: string;
  versionId: string;
  version: number;
  extraction: TextExtraction;
  fingerprintId: string | null;
  mimeType: string;
}

async function writeVersion(ownerId: string, documentId: string, version: number, upload: ValidatedUpload, opts: { extract: boolean; isDemo?: boolean }) {
  const sha256 = crypto.createHash("sha256").update(upload.bytes).digest("hex");
  const versionId = newId("dv");
  const key = `${ownerId.replace(/[^a-z0-9_-]/gi, "")}/${documentId}/v${version}-${sha256.slice(0, 12)}`;
  const store = storage();
  await store.put(key, upload.bytes, upload.mimeType);

  const extraction: TextExtraction = opts.extract
    ? await extractText(upload.bytes, upload.kind, upload.mimeType, { userId: ownerId })
    : { text: null, pageTexts: null, pageCount: null, method: "none", status: "unavailable", note: "Text extraction not requested." };

  await db.insert(documentVersion).values({
    id: versionId,
    documentId,
    version,
    storageProvider: store.id,
    storageKey: key,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    sizeBytes: upload.size,
    sha256,
    pageCount: extraction.pageCount,
    extractedText: extraction.text,
    pageTexts: extraction.pageTexts,
    extractionMethod: extraction.method,
    extractionStatus: extraction.status === "unavailable" && !opts.extract ? "not_attempted" : extraction.status,
    extractionNote: extraction.note,
    createdBy: ownerId,
  });

  let fingerprintId: string | null = null;
  if (isImageKind(upload.kind)) {
    try {
      const fp = await fingerprintImage(upload.bytes);
      const metadata = await readImageMetadata(upload.bytes);
      fingerprintId = newId("fp");
      await db.insert(imageFingerprint).values({ id: fingerprintId, ownerId, documentVersionId: versionId, dHash: fp.dHash, aHash: fp.aHash, width: fp.width, height: fp.height, metadata });
    } catch {
      fingerprintId = null;
    }
  }
  return { versionId, extraction, fingerprintId };
}

export async function storeDocument(input: {
  ownerId: string;
  upload: ValidatedUpload;
  title?: string;
  docType: DocumentType;
  links?: DocumentLinks;
  tags?: string[];
  extract?: boolean;
  isDemo?: boolean;
}): Promise<StoredDocument> {
  const documentId = newId("doc");
  await db.insert(document).values({
    id: documentId,
    ownerId: input.ownerId,
    title: (input.title ?? input.upload.fileName).slice(0, 160),
    docType: input.docType,
    tags: input.tags ?? [],
    investigationId: input.links?.investigationId ?? null,
    tenancyId: input.links?.tenancyId ?? null,
    maintenanceCaseId: input.links?.maintenanceCaseId ?? null,
    disputeId: input.links?.disputeId ?? null,
    depositId: input.links?.depositId ?? null,
    currentVersion: 1,
    isDemo: input.isDemo ?? false,
  });
  const v = await writeVersion(input.ownerId, documentId, 1, input.upload, { extract: input.extract ?? true });
  await audit({ actorId: input.ownerId, action: "document.upload", resourceType: "document", resourceId: documentId, metadata: { docType: input.docType, size: input.upload.size, mime: input.upload.mimeType } });
  return { documentId, versionId: v.versionId, version: 1, extraction: v.extraction, fingerprintId: v.fingerprintId, mimeType: input.upload.mimeType };
}

export async function addDocumentVersion(ownerId: string, documentId: string, upload: ValidatedUpload): Promise<StoredDocument> {
  const doc = await getOwnedDocument(ownerId, documentId);
  const version = doc.currentVersion + 1;
  const v = await writeVersion(ownerId, documentId, version, upload, { extract: true });
  await db.update(document).set({ currentVersion: version, updatedAt: new Date() }).where(eq(document.id, documentId));
  await audit({ actorId: ownerId, action: "document.new_version", resourceType: "document", resourceId: documentId, metadata: { version } });
  return { documentId, versionId: v.versionId, version, extraction: v.extraction, fingerprintId: v.fingerprintId, mimeType: upload.mimeType };
}

export async function getOwnedDocument(ownerId: string, documentId: string) {
  const [doc] = await db.select().from(document).where(and(eq(document.id, documentId), eq(document.ownerId, ownerId)));
  if (!doc) throw notFound("Document");
  return doc;
}

export async function getDocumentWithVersions(ownerId: string, documentId: string) {
  const doc = await getOwnedDocument(ownerId, documentId);
  const versions = await db.select().from(documentVersion).where(eq(documentVersion.documentId, documentId)).orderBy(desc(documentVersion.version));
  return { doc, versions };
}

/** Authorized byte access: the version must belong to a document owned by the user. */
export async function readOwnedVersion(ownerId: string, versionId: string) {
  const [row] = await db
    .select({ v: documentVersion, d: document })
    .from(documentVersion)
    .innerJoin(document, eq(document.id, documentVersion.documentId))
    .where(and(eq(documentVersion.id, versionId), eq(document.ownerId, ownerId)));
  if (!row) throw notFound("File");
  const bytes = await storage().get(row.v.storageKey);
  return { bytes, version: row.v, doc: row.d };
}

export async function listDocuments(
  ownerId: string,
  opts: { q?: string; docType?: DocumentType; tag?: string; trash?: boolean; investigationId?: string; page?: number; pageSize?: number } = {},
) {
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const page = Math.max(1, opts.page ?? 1);
  const conds = [eq(document.ownerId, ownerId), opts.trash ? isNotNull(document.deletedAt) : isNull(document.deletedAt)];
  if (opts.docType) conds.push(eq(document.docType, opts.docType));
  if (opts.investigationId) conds.push(eq(document.investigationId, opts.investigationId));
  if (opts.tag) conds.push(like(document.tags, `%"${opts.tag.replace(/["%_]/g, "")}"%`));
  if (opts.q) {
    const q = `%${opts.q.replace(/[%_]/g, "").toLowerCase()}%`;
    conds.push(
      or(
        sql`lower(${document.title}) like ${q}`,
        sql`lower(coalesce(${document.notes}, '')) like ${q}`,
        sql`exists (select 1 from ${documentVersion} dv where dv.document_id = ${document.id} and lower(coalesce(dv.extracted_text, '')) like ${q})`,
      )!,
    );
  }
  const where = and(...conds);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(document).where(where);
  const rows = await db
    .select()
    .from(document)
    .where(where)
    .orderBy(desc(document.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const versions = rows.length
    ? await db.select().from(documentVersion).where(inArray(documentVersion.documentId, rows.map((r) => r.id)))
    : [];
  return {
    total: Number(count),
    page,
    pageSize,
    items: rows.map((d) => ({ ...d, latest: versions.filter((v) => v.documentId === d.id).sort((a, b) => b.version - a.version)[0] ?? null })),
  };
}

export async function updateDocumentMeta(ownerId: string, documentId: string, patch: { title?: string; tags?: string[]; notes?: string | null; docType?: DocumentType; links?: DocumentLinks }) {
  await getOwnedDocument(ownerId, documentId);
  await db
    .update(document)
    .set({
      ...(patch.title !== undefined ? { title: patch.title.slice(0, 160) } : {}),
      ...(patch.tags !== undefined ? { tags: [...new Set(patch.tags.map((t) => t.trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 15) } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes?.slice(0, 2000) ?? null } : {}),
      ...(patch.docType ? { docType: patch.docType } : {}),
      ...(patch.links ?? {}),
      updatedAt: new Date(),
    })
    .where(eq(document.id, documentId));
}

export async function softDeleteDocument(ownerId: string, documentId: string) {
  await getOwnedDocument(ownerId, documentId);
  await db.update(document).set({ deletedAt: new Date() }).where(eq(document.id, documentId));
  await audit({ actorId: ownerId, action: "document.soft_delete", resourceType: "document", resourceId: documentId });
}

export async function restoreDocument(ownerId: string, documentId: string) {
  await getOwnedDocument(ownerId, documentId);
  await db.update(document).set({ deletedAt: null }).where(eq(document.id, documentId));
  await audit({ actorId: ownerId, action: "document.restore", resourceType: "document", resourceId: documentId });
}

/** Permanently removes rows and stored bytes for every version. */
export async function permanentlyDeleteDocument(ownerId: string, documentId: string) {
  await getOwnedDocument(ownerId, documentId);
  const versions = await db.select().from(documentVersion).where(eq(documentVersion.documentId, documentId));
  for (const v of versions) {
    try {
      await storage().delete(v.storageKey);
    } catch {
      /* already gone */
    }
  }
  await db.delete(document).where(eq(document.id, documentId));
  await audit({ actorId: ownerId, action: "document.permanent_delete", resourceType: "document", resourceId: documentId, metadata: { versions: versions.length } });
}
