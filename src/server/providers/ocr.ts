/**
 * Image text extraction (OCR).
 *  - local: bundled Tesseract (offline, no external calls) — mode LOCAL
 *  - google_vision: Google Cloud Vision DOCUMENT_TEXT_DETECTION — mode LIVE
 *  - llm_vision: Claude vision transcription — mode LIVE
 * OCR output is untrusted text; it is extracted, never "verified".
 */
import path from "node:path";
import { z } from "zod";
import { env } from "../env";
import { fetchJson, safeErrorMessage, withTimeout } from "./http";
import { llm, wrapUntrusted } from "./llm";
import type { Provider, ProviderInfo, ProviderResult } from "./types";

export interface OcrOutput {
  text: string;
  method: "ocr_local" | "ocr_provider" | "llm_vision";
  confidence?: number;
}

export interface OcrProvider extends Provider {
  recognize(bytes: Buffer, mimeType: string, ctx: { userId: string | null }): Promise<ProviderResult<OcrOutput>>;
}

class LocalTesseract implements OcrProvider {
  info(): ProviderInfo {
    return {
      id: "tesseract_local",
      category: "ocr",
      name: "Tesseract (bundled, offline)",
      description: "On-server OCR using the bundled English model. No data leaves the server. Accuracy varies with screenshot quality.",
      capabilities: ["ocr_english"],
      status: "LIVE",
      statusMessage: "Available locally (no external service). Results are marked as OCR output and may contain errors.",
      requiredEnv: ["OCR_PROVIDER=local"],
      timeoutMs: 60000,
      retries: 0,
    };
  }
  async recognize(bytes: Buffer): Promise<ProviderResult<OcrOutput>> {
    try {
      const { createWorker } = await import("tesseract.js");
      const langPath = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
      const worker = await createWorker("eng", 1, { langPath, gzip: true, cacheMethod: "none" });
      try {
        const res = await withTimeout(worker.recognize(bytes), 60000, "Local OCR");
        return {
          ok: true,
          mode: "LOCAL",
          providerId: "tesseract_local",
          retrievedAt: new Date(),
          data: { text: res.data.text ?? "", method: "ocr_local", confidence: res.data.confidence },
        };
      } finally {
        await worker.terminate().catch(() => undefined);
      }
    } catch (err) {
      return { ok: false, status: "ERROR", providerId: "tesseract_local", message: `Local OCR failed: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}` };
    }
  }
}

class GoogleVisionOcr implements OcrProvider {
  info(): ProviderInfo {
    const ok = Boolean(env().GOOGLE_CLOUD_VISION_API_KEY);
    return {
      id: "google_vision_ocr",
      category: "ocr",
      name: "Google Cloud Vision OCR",
      description: "DOCUMENT_TEXT_DETECTION via the Cloud Vision REST API.",
      capabilities: ["ocr_multilingual"],
      status: ok ? "LIVE" : "NOT_CONFIGURED",
      statusMessage: ok ? "API key configured." : "Set GOOGLE_CLOUD_VISION_API_KEY.",
      requiredEnv: ["GOOGLE_CLOUD_VISION_API_KEY"],
      docsUrl: "https://cloud.google.com/vision/docs/ocr",
      dataRestrictions: "Images are sent to Google Cloud when this provider is selected.",
      timeoutMs: 20000,
      retries: 1,
    };
  }
  async recognize(bytes: Buffer): Promise<ProviderResult<OcrOutput>> {
    const key = env().GOOGLE_CLOUD_VISION_API_KEY;
    if (!key) return { ok: false, status: "NOT_CONFIGURED", providerId: "google_vision_ocr", message: "Google Cloud Vision is not configured." };
    try {
      const data = await fetchJson<{ responses?: Array<{ fullTextAnnotation?: { text?: string }; error?: { message?: string } }> }>(
        `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          timeoutMs: 20000,
          retries: 1,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: [{ image: { content: bytes.toString("base64") }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] }] }),
        },
      );
      const r = data.responses?.[0];
      if (r?.error) return { ok: false, status: "ERROR", providerId: "google_vision_ocr", message: "Vision API returned an error." };
      return { ok: true, mode: "LIVE", providerId: "google_vision_ocr", retrievedAt: new Date(), data: { text: r?.fullTextAnnotation?.text ?? "", method: "ocr_provider" } };
    } catch (err) {
      return { ok: false, status: "UNAVAILABLE", providerId: "google_vision_ocr", message: safeErrorMessage(err) };
    }
  }
}

class LlmVisionOcr implements OcrProvider {
  info(): ProviderInfo {
    const base = llm().info();
    return {
      id: "llm_vision_ocr",
      category: "ocr",
      name: "Claude vision transcription",
      description: "Transcribes text visible in screenshots using the configured Claude model.",
      capabilities: ["ocr_multilingual"],
      status: base.status,
      statusMessage: base.status === "LIVE" ? "Uses the configured Anthropic provider." : "Requires ANTHROPIC_API_KEY.",
      requiredEnv: ["ANTHROPIC_API_KEY", "OCR_PROVIDER=llm_vision"],
      dataRestrictions: "Images are sent to Anthropic when this provider is selected.",
    };
  }
  async recognize(bytes: Buffer, mimeType: string, ctx: { userId: string | null }): Promise<ProviderResult<OcrOutput>> {
    const res = await llm().structured(
      { userId: ctx.userId, purpose: "vision_ocr" },
      {
        system: "You transcribe text visible in an image exactly as written, preserving line breaks. Do not summarize, translate, correct or add anything.",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType as "image/png" | "image/jpeg" | "image/webp", data: bytes.toString("base64") } },
          { type: "text", text: `${wrapUntrusted("image", "(the image above)", 100)}\nReturn the transcription as JSON.` },
        ],
        jsonSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
        validator: z.object({ text: z.string() }),
        maxTokens: 4000,
      },
    );
    if (!res.ok) return { ok: false, status: res.reason === "not_configured" ? "NOT_CONFIGURED" : "UNAVAILABLE", providerId: "llm_vision_ocr", message: res.message };
    return { ok: true, mode: "LIVE", providerId: "llm_vision_ocr", retrievedAt: new Date(), data: { text: res.data.text, method: "llm_vision" } };
  }
}

class NoOcr implements OcrProvider {
  info(): ProviderInfo {
    return {
      id: "none",
      category: "ocr",
      name: "OCR disabled",
      description: "Image text extraction is disabled. Paste text instead.",
      capabilities: [],
      status: "NOT_CONFIGURED",
      statusMessage: "Set OCR_PROVIDER=local (offline) or configure a provider.",
      requiredEnv: ["OCR_PROVIDER"],
    };
  }
  async recognize(): Promise<ProviderResult<OcrOutput>> {
    return { ok: false, status: "NOT_CONFIGURED", providerId: "none", message: "OCR is not configured. Paste the text from the screenshot instead." };
  }
}

export function getOcrProvider(): OcrProvider {
  switch (env().OCR_PROVIDER) {
    case "local":
      return new LocalTesseract();
    case "google_vision":
      return new GoogleVisionOcr();
    case "llm_vision":
      return new LlmVisionOcr();
    default:
      return new NoOcr();
  }
}

export function allOcrProviders(): OcrProvider[] {
  return [new LocalTesseract(), new GoogleVisionOcr(), new LlmVisionOcr()];
}
