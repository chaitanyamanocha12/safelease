/**
 * Outbound HTTP helpers for providers: timeouts, bounded retries with
 * backoff (only for idempotent/retry-safe failures) and safe error text.
 */
export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
  }
}

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  /** Abort signal from the caller (e.g. agent cancellation). */
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithPolicy(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 15000, retries = 1, signal, ...init } = opts;
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
    const onAbort = () => controller.abort(new Error("cancelled"));
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetch(url, { ...init, signal: controller.signal, redirect: init.redirect ?? "follow" });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new ProviderHttpError(`Provider responded ${res.status}`, res.status, true);
      } else {
        return res;
      }
    } catch (err) {
      if (signal?.aborted) throw new ProviderHttpError("Request cancelled", undefined, false);
      lastErr = new ProviderHttpError(
        err instanceof Error && err.message === "timeout" ? "Provider request timed out" : "Provider could not be reached",
        undefined,
        true,
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
    attempt++;
    if (attempt <= retries) await sleep(400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 150));
  }
  throw lastErr instanceof Error ? lastErr : new ProviderHttpError("Provider request failed");
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchWithPolicy(url, opts);
  if (!res.ok) throw new ProviderHttpError(`Provider responded ${res.status}`, res.status, false);
  return (await res.json()) as T;
}

/** Run a promise with a hard timeout. */
export async function withTimeout<T>(p: Promise<T>, ms: number, label = "operation"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function safeErrorMessage(err: unknown): string {
  if (err instanceof ProviderHttpError) return err.message;
  if (err instanceof Error && /timed out/.test(err.message)) return err.message;
  return "Provider request failed";
}
