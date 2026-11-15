/**
 * Common provider contracts. Every external integration reports one of
 * five statuses and never silently substitutes demo data for a live result.
 */
export const PROVIDER_STATUSES = ["LIVE", "NOT_CONFIGURED", "UNAVAILABLE", "DEMO", "ERROR"] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export type ProviderCategory =
  | "llm"
  | "ocr"
  | "web_search"
  | "image_match"
  | "geocoding"
  | "maps"
  | "listings"
  | "routing"
  | "email"
  | "storage"
  | "scheduler";

export interface ProviderInfo {
  id: string;
  category: ProviderCategory;
  name: string;
  description: string;
  capabilities: string[];
  /** Static configuration status (no network call). */
  status: ProviderStatus;
  statusMessage: string;
  requiredEnv: string[];
  attribution?: string;
  docsUrl?: string;
  dataRestrictions?: string;
  timeoutMs?: number;
  retries?: number;
  rateLimit?: string;
}

export interface HealthResult {
  status: ProviderStatus;
  message: string;
  latencyMs?: number;
}

export interface Provider {
  info(): ProviderInfo;
  /** Optional live connectivity check. Must not leak secrets in `message`. */
  healthCheck?(): Promise<HealthResult>;
}

/** Outcome wrapper for provider calls: never throws to callers. */
export type ProviderResult<T> =
  | { ok: true; mode: "LIVE" | "DEMO" | "LOCAL"; data: T; providerId: string; retrievedAt: Date }
  | { ok: false; status: Exclude<ProviderStatus, "LIVE">; providerId: string; message: string };
