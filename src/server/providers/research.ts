/**
 * Public web research (Brave Search API) and reverse image search
 * (Google Cloud Vision Web Detection). Results are leads to review, not
 * verification. Snippets are untrusted content.
 */
import { env } from "../env";
import { fetchJson, safeErrorMessage } from "./http";
import type { Provider, ProviderInfo, ProviderResult } from "./types";

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export class BraveSearch implements Provider {
  info(): ProviderInfo {
    const ok = env().WEB_SEARCH_PROVIDER === "brave" && Boolean(env().BRAVE_SEARCH_API_KEY);
    return {
      id: "brave_search",
      category: "web_search",
      name: "Brave Search API",
      description: "Public web search for property-management companies and business listings. Results are leads, not verification.",
      capabilities: ["web_search"],
      status: ok ? "LIVE" : "NOT_CONFIGURED",
      statusMessage: ok ? "Configured." : "Set WEB_SEARCH_PROVIDER=brave and BRAVE_SEARCH_API_KEY.",
      requiredEnv: ["WEB_SEARCH_PROVIDER=brave", "BRAVE_SEARCH_API_KEY"],
      docsUrl: "https://api-dashboard.search.brave.com/app/documentation/web-search/get-started",
      dataRestrictions: "Queries contain names/business names from the case, never document contents.",
      rateLimit: "Per your Brave plan",
      timeoutMs: 8000,
      retries: 1,
    };
  }
  async search(query: string, count = 5): Promise<ProviderResult<WebResult[]>> {
    if (this.info().status !== "LIVE") return { ok: false, status: "NOT_CONFIGURED", providerId: "brave_search", message: "No web search provider is configured." };
    try {
      const q = new URLSearchParams({ q: query.slice(0, 300), count: String(count), country: "ca", safesearch: "moderate" });
      const data = await fetchJson<{ web?: { results?: Array<{ title?: string; url?: string; description?: string }> } }>(`https://api.search.brave.com/res/v1/web/search?${q}`, {
        timeoutMs: 8000,
        retries: 1,
        headers: { Accept: "application/json", "X-Subscription-Token": env().BRAVE_SEARCH_API_KEY! },
      });
      const results = (data.web?.results ?? []).slice(0, count).map((r) => ({
        title: (r.title ?? "").replace(/<[^>]+>/g, "").slice(0, 200),
        url: r.url ?? "",
        snippet: (r.description ?? "").replace(/<[^>]+>/g, "").slice(0, 400),
      }));
      return { ok: true, mode: "LIVE", providerId: "brave_search", retrievedAt: new Date(), data: results };
    } catch (err) {
      return { ok: false, status: "UNAVAILABLE", providerId: "brave_search", message: safeErrorMessage(err) };
    }
  }
}

export interface WebImageMatch {
  fullMatches: string[];
  partialMatches: string[];
  pagesWithMatches: Array<{ url: string; title: string | null }>;
}

export class GoogleVisionWebDetection implements Provider {
  info(): ProviderInfo {
    const ok = env().IMAGE_MATCH_PROVIDER === "google_vision_web" && Boolean(env().GOOGLE_CLOUD_VISION_API_KEY);
    return {
      id: "google_vision_web",
      category: "image_match",
      name: "Google Cloud Vision — Web Detection",
      description: "Finds pages on the web that contain matching or similar images. No match does not mean an image is original.",
      capabilities: ["reverse_image_search"],
      status: ok ? "LIVE" : "NOT_CONFIGURED",
      statusMessage: ok ? "Configured." : "Set IMAGE_MATCH_PROVIDER=google_vision_web and GOOGLE_CLOUD_VISION_API_KEY.",
      requiredEnv: ["IMAGE_MATCH_PROVIDER=google_vision_web", "GOOGLE_CLOUD_VISION_API_KEY"],
      docsUrl: "https://cloud.google.com/vision/docs/detecting-web",
      dataRestrictions: "Property photos are sent to Google Cloud when a web image search runs.",
      timeoutMs: 20000,
      retries: 1,
    };
  }
  async detect(bytes: Buffer): Promise<ProviderResult<WebImageMatch>> {
    if (this.info().status !== "LIVE") return { ok: false, status: "NOT_CONFIGURED", providerId: "google_vision_web", message: "Web image search is not configured." };
    try {
      const data = await fetchJson<{
        responses?: Array<{
          webDetection?: {
            fullMatchingImages?: Array<{ url: string }>;
            partialMatchingImages?: Array<{ url: string }>;
            pagesWithMatchingImages?: Array<{ url: string; pageTitle?: string }>;
          };
        }>;
      }>(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(env().GOOGLE_CLOUD_VISION_API_KEY!)}`, {
        method: "POST",
        timeoutMs: 20000,
        retries: 1,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ image: { content: bytes.toString("base64") }, features: [{ type: "WEB_DETECTION", maxResults: 10 }] }] }),
      });
      const w = data.responses?.[0]?.webDetection;
      return {
        ok: true,
        mode: "LIVE",
        providerId: "google_vision_web",
        retrievedAt: new Date(),
        data: {
          fullMatches: (w?.fullMatchingImages ?? []).map((x) => x.url).slice(0, 10),
          partialMatches: (w?.partialMatchingImages ?? []).map((x) => x.url).slice(0, 10),
          pagesWithMatches: (w?.pagesWithMatchingImages ?? []).map((p) => ({ url: p.url, title: p.pageTitle?.replace(/<[^>]+>/g, "") ?? null })).slice(0, 10),
        },
      };
    } catch (err) {
      return { ok: false, status: "UNAVAILABLE", providerId: "google_vision_web", message: safeErrorMessage(err) };
    }
  }
}
