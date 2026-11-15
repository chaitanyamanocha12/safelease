/**
 * Text extraction from uploaded files: PDF text layer (unpdf) and images (OCR).
 * Scanned PDFs without a text layer are reported honestly as "partial".
 */
import type { AllowedKind } from "../security/upload";
import { getOcrProvider } from "../providers/ocr";

export interface TextExtraction {
  text: string | null;
  pageTexts: string[] | null;
  pageCount: number | null;
  method: "none" | "pdf_text" | "ocr_local" | "ocr_provider" | "llm_vision" | "plain_text";
  status: "succeeded" | "partial" | "failed" | "unavailable";
  note: string | null;
}

export async function extractPdfText(bytes: Buffer): Promise<TextExtraction> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map((p) => p.replace(/[ \t]+\n/g, "\n").trim());
    const joined = pages.join("\n\n");
    if (joined.replace(/\s/g, "").length < 40) {
      return {
        text: joined || null,
        pageTexts: pages,
        pageCount: totalPages,
        method: "pdf_text",
        status: "partial",
        note: "This PDF has little or no text layer (likely a scan). Upload photos/screenshots of the pages for OCR, or paste the text.",
      };
    }
    return { text: joined, pageTexts: pages, pageCount: totalPages, method: "pdf_text", status: "succeeded", note: null };
  } catch {
    return { text: null, pageTexts: null, pageCount: null, method: "pdf_text", status: "failed", note: "The PDF could not be read. It may be encrypted or damaged." };
  }
}

export async function extractText(bytes: Buffer, kind: AllowedKind, mimeType: string, ctx: { userId: string | null }): Promise<TextExtraction> {
  if (kind === "text") {
    const text = bytes.toString("utf-8").slice(0, 300_000);
    return { text, pageTexts: null, pageCount: null, method: "plain_text", status: "succeeded", note: null };
  }
  if (kind === "pdf") return extractPdfText(bytes);
  const ocr = getOcrProvider();
  const res = await ocr.recognize(bytes, mimeType, ctx);
  if (!res.ok) {
    return {
      text: null,
      pageTexts: null,
      pageCount: null,
      method: "none",
      status: res.status === "NOT_CONFIGURED" ? "unavailable" : "failed",
      note: res.message,
    };
  }
  const text = res.data.text.trim();
  return {
    text: text || null,
    pageTexts: null,
    pageCount: 1,
    method: res.data.method,
    status: text.length > 20 ? "succeeded" : "partial",
    note:
      text.length > 20
        ? `Text read by ${res.mode === "LOCAL" ? "on-server OCR" : "OCR provider"}${res.data.confidence !== undefined ? ` (engine confidence ${Math.round(res.data.confidence)}%)` : ""}. Check it for recognition errors.`
        : "Little text was recognized in this image.",
  };
}
