/**
 * Central provider registry for status display and health checks.
 * Static status comes from configuration; LIVE connectivity is only claimed
 * after a successful health check.
 */
import { db } from "../db/client";
import { providerHealthCheck } from "../db/schema";
import { newId } from "@/lib/ids";
import { env } from "../env";
import { getEmailProvider } from "./email";
import { MapTilesInfo, NominatimGeocoder, OpenRouteService } from "./geo-providers";
import { llm } from "./llm";
import { listingAdapters } from "./listings";
import { allOcrProviders, getOcrProvider } from "./ocr";
import { BraveSearch, GoogleVisionWebDetection } from "./research";
import { storage } from "../storage";
import type { HealthResult, ProviderInfo } from "./types";

function schedulerInfo(): ProviderInfo {
  const cron = Boolean(env().CRON_SECRET);
  return {
    id: "scheduler",
    category: "scheduler",
    name: "Monitoring job scheduler",
    description: "Runs due monitoring jobs. Locally: `npm run jobs:run` or the admin 'Run due jobs' button. Hosted: an external cron calling /api/cron with CRON_SECRET.",
    capabilities: ["run_due_jobs"],
    status: cron ? "LIVE" : "NOT_CONFIGURED",
    statusMessage: cron
      ? "Cron endpoint is protected and ready. Jobs only run when your scheduler actually calls it."
      : "No automatic scheduler. Jobs run only when triggered manually (npm run jobs:run or admin).",
    requiredEnv: ["CRON_SECRET"],
  };
}

export function allProviderInfo(): ProviderInfo[] {
  const ocrActive = getOcrProvider().info().id;
  return [
    llm().info(),
    ...allOcrProviders().map((p) => ({ ...p.info(), statusMessage: `${p.info().id === ocrActive ? "[ACTIVE] " : ""}${p.info().statusMessage}` })),
    new BraveSearch().info(),
    new GoogleVisionWebDetection().info(),
    new NominatimGeocoder().info(),
    new OpenRouteService().info(),
    new MapTilesInfo().info(),
    ...listingAdapters(null).map((a) => a.info()),
    getEmailProvider().info(),
    storage().info(),
    schedulerInfo(),
  ];
}

export async function runHealthChecks(): Promise<Array<ProviderInfo & { health: HealthResult }>> {
  const infos = allProviderInfo();
  const out: Array<ProviderInfo & { health: HealthResult }> = [];
  for (const info of infos) {
    let health: HealthResult = { status: info.status, message: "Configuration status only (no live check available)." };
    const started = Date.now();
    try {
      if (info.id === "anthropic") health = await llm().healthCheck();
      else if (info.id === "nominatim" && info.status === "LIVE") {
        const r = await new NominatimGeocoder().geocode("1459 LeMarchant Street");
        health = r.ok ? { status: "LIVE", message: "Test query answered.", latencyMs: Date.now() - started } : { status: "ERROR", message: r.message };
      } else if (info.id === "brave_search" && info.status === "LIVE") {
        const r = await new BraveSearch().search("Nova Scotia Residential Tenancies", 1);
        health = r.ok ? { status: "LIVE", message: "Test query answered.", latencyMs: Date.now() - started } : { status: "ERROR", message: r.message };
      } else if (info.id === "partner_feed" && info.status === "LIVE") {
        const r = await listingAdapters(null)[0]!.searchListings({});
        health = r.ok ? { status: "LIVE", message: `Feed returned ${r.data.length} listings.`, latencyMs: Date.now() - started } : { status: "ERROR", message: r.message };
      } else if (info.id === "local" && info.category === "storage") {
        const key = `healthcheck/probe-${Date.now()}.txt`;
        await storage().put(key, Buffer.from("ok"), "text/plain");
        await storage().get(key);
        await storage().delete(key);
        health = { status: "LIVE", message: "Write/read/delete succeeded.", latencyMs: Date.now() - started };
      }
    } catch {
      health = { status: "ERROR", message: "Health check failed." };
    }
    out.push({ ...info, health });
    try {
      await db.insert(providerHealthCheck).values({
        id: newId("phc"),
        category: info.category,
        providerId: info.id,
        status: health.status,
        message: health.message.slice(0, 300),
        latencyMs: health.latencyMs ?? null,
      });
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function aiModeLabel(): { mode: "LLM" | "DETERMINISTIC"; label: string } {
  return llm().configured()
    ? { mode: "LLM", label: `AI planning enabled (${llm().model()})` }
    : { mode: "DETERMINISTIC", label: "Deterministic engine (no LLM configured)" };
}
