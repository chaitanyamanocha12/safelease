/**
 * In-memory fixed-window rate limiter for sensitive endpoints.
 * Per-process only: on multi-instance hosting use a shared store (documented in SECURITY.md).
 */
import { AppError } from "../errors";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return;
  }
  b.count++;
  if (b.count > max) throw new AppError("RATE_LIMITED", `Too many requests. Try again in ${Math.ceil((b.resetAt - now) / 1000)} seconds.`);
}

export function resetRateLimits() {
  buckets.clear();
}
