/**
 * Server-only, schema-validated environment access.
 * Secrets are read here and never exported to client bundles.
 */
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const int = (def: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? Number.parseInt(v, 10) : def;
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
    });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().default("file:./data/safelease.db"),
  DATABASE_AUTH_TOKEN: optional,
  BETTER_AUTH_SECRET: optional,
  /** Enables the seeded demo account + demo reset. Never enabled implicitly in production. */
  DEMO_MODE: bool(false),

  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage/private"),
  S3_BUCKET: optional,
  S3_REGION: optional,
  S3_ENDPOINT: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,

  LLM_PROVIDER: z.enum(["anthropic", "none"]).default("anthropic"),
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  LLM_MAX_OUTPUT_TOKENS: int(2048, 256, 8192),
  LLM_MAX_CALLS_PER_RUN: int(4, 0, 20),
  LLM_TIMEOUT_MS: int(45000, 5000, 120000),
  LLM_DAILY_USER_BUDGET_USD: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 2)),

  OCR_PROVIDER: z.enum(["local", "google_vision", "llm_vision", "none"]).default("local"),
  GOOGLE_CLOUD_VISION_API_KEY: optional,

  WEB_SEARCH_PROVIDER: z.enum(["brave", "none"]).default("none"),
  BRAVE_SEARCH_API_KEY: optional,

  IMAGE_MATCH_PROVIDER: z.enum(["google_vision_web", "none"]).default("none"),

  GEOCODER_PROVIDER: z.enum(["nominatim", "none"]).default("none"),
  NOMINATIM_BASE_URL: z.string().default("https://nominatim.openstreetmap.org"),
  NOMINATIM_USER_AGENT: optional,

  ROUTING_PROVIDER: z.enum(["openrouteservice", "none"]).default("none"),
  OPENROUTESERVICE_API_KEY: optional,

  MAP_TILE_URL: z.string().default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
  MAP_TILE_ATTRIBUTION: z
    .string()
    .default('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'),

  RENTAL_FEED_URL: optional,
  RENTAL_FEED_API_KEY: optional,
  RENTAL_FEED_NAME: z.string().default("Licensed partner feed"),

  EMAIL_PROVIDER: z.enum(["resend", "dev_log", "none"]).default("none"),
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,

  CRON_SECRET: optional,
  URL_FETCH_ENABLED: bool(true),

  AGENT_MAX_ITERATIONS: int(4, 1, 8),
  AGENT_MAX_TOOL_CALLS: int(24, 4, 60),
  AGENT_TOOL_TIMEOUT_MS: int(20000, 2000, 60000),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = null;
}

export function isProduction() {
  return env().NODE_ENV === "production";
}

/** Demo account/reset are allowed only when explicitly enabled, and never against a remote prod DB without DEMO_MODE. */
export function demoModeEnabled() {
  return env().DEMO_MODE;
}
