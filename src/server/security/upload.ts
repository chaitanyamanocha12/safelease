/**
 * Upload validation: size limits and content sniffing by magic bytes.
 * The client-declared MIME type is never trusted.
 */
import { AppError } from "../errors";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 12;

export type AllowedKind = "pdf" | "png" | "jpeg" | "webp" | "text";

const MIME: Record<AllowedKind, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  text: "text/plain",
};

export function sniff(bytes: Uint8Array): AllowedKind | null {
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return "pdf";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return "webp";
  // Plain text: valid UTF-8 without NUL bytes in the first 4KB.
  const head = b.slice(0, 4096);
  if (head.length > 0 && !head.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(head);
      return "text";
    } catch {
      return null;
    }
  }
  return null;
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "upload";
  const cleaned = base.replace(/[^\w.\- ()]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || "upload";
}

export interface ValidatedUpload {
  bytes: Buffer;
  kind: AllowedKind;
  mimeType: string;
  fileName: string;
  size: number;
}

export async function validateUpload(file: File, allowed: AllowedKind[] = ["pdf", "png", "jpeg", "webp", "text"]): Promise<ValidatedUpload> {
  if (!file || typeof file.arrayBuffer !== "function") throw new AppError("VALIDATION", "No file was provided.");
  if (file.size === 0) throw new AppError("VALIDATION", "The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", `Files must be ${MAX_UPLOAD_BYTES / 1024 / 1024} MB or smaller.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind || !allowed.includes(kind)) {
    throw new AppError("UNSUPPORTED_MEDIA", `Unsupported file type. Allowed: ${allowed.map((k) => k.toUpperCase()).join(", ")}.`);
  }
  return { bytes, kind, mimeType: MIME[kind], fileName: sanitizeFileName(file.name), size: bytes.length };
}

export function isImageKind(kind: AllowedKind) {
  return kind === "png" || kind === "jpeg" || kind === "webp";
}
