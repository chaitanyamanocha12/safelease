/**
 * Fixed-window rate limiter backed by the shared rate_limit table, so limits
 * hold across multiple server instances. Falls back to in-memory counting if
 * the database is unreachable (fail-open would be unsafe; fail-local is used).
 */
import { eq, sql } from "drizzle-orm";
import { AppError } from "../errors";
import { db } from "../db/client";
import { rateLimit as rl } from "../db/schema";
import { newId } from "@/lib/ids";

const memory = new Map<string, { count: number; resetAt: number }>();

function memoryLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = memory.get(key);
  if (!b || b.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (++b.count > max) throw new AppError("RATE_LIMITED", `Too many requests. Try again in ${Math.ceil((b.resetAt - now) / 1000)} seconds.`);
}

export async function rateLimit(rawKey: string, max: number, windowMs: number): Promise<void> {
  const key = `app:${rawKey}`;
  const now = Date.now();
  try {
    const [row] = await db.select().from(rl).where(eq(rl.key, key));
    if (!row || now - row.lastRequest > windowMs) {
      await db
        .insert(rl)
        .values({ id: newId("rl"), key, count: 1, lastRequest: now })
        .onConflictDoUpdate({ target: rl.key, set: { count: 1, lastRequest: now } });
      return;
    }
    if (row.count >= max) {
      throw new AppError("RATE_LIMITED", `Too many requests. Try again in ${Math.ceil((row.lastRequest + windowMs - now) / 1000)} seconds.`);
    }
    await db.update(rl).set({ count: sql`${rl.count} + 1` }).where(eq(rl.key, key));
  } catch (err) {
    if (err instanceof AppError) throw err;
    memoryLimit(key, max, windowMs);
  }
}

export async function resetRateLimits() {
  memory.clear();
  await db.delete(rl).where(sql`${rl.key} like 'app:%'`);
}
