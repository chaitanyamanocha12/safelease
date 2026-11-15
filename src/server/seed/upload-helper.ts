import { AppError } from "../errors";
import { sanitizeFileName, sniff, type ValidatedUpload, MAX_UPLOAD_BYTES } from "../security/upload";

const MIME = { pdf: "application/pdf", png: "image/png", jpeg: "image/jpeg", webp: "image/webp", text: "text/plain" } as const;

/** Validate an in-memory buffer exactly like a user upload (used by seeds and tests). */
export async function validateBuffer(bytes: Buffer, fileName: string): Promise<ValidatedUpload> {
  if (bytes.length > MAX_UPLOAD_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", "Too large");
  const kind = sniff(bytes);
  if (!kind) throw new AppError("UNSUPPORTED_MEDIA", "Unsupported file type");
  return { bytes, kind, mimeType: MIME[kind], fileName: sanitizeFileName(fileName), size: bytes.length };
}
