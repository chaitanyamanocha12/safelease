/**
 * Structured application errors. Messages are safe to show to users;
 * internal details go to `cause` and are never serialized to clients.
 */
export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "NOT_CONFIGURED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA"
  | "INTERNAL";

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  NOT_CONFIGURED: 501,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: AppErrorCode, message: string, opts?: { cause?: unknown; fieldErrors?: Record<string, string> }) {
    super(message, { cause: opts?.cause });
    this.code = code;
    this.status = STATUS[code];
    this.fieldErrors = opts?.fieldErrors;
  }
}

export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found.`);
export const forbidden = () => new AppError("FORBIDDEN", "You do not have access to this resource.");

/** Result shape returned from server actions to client forms. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code: AppErrorCode; fieldErrors?: Record<string, string> };

export function toActionError(err: unknown): Extract<ActionResult, { ok: false }> {
  if (err instanceof AppError) {
    return { ok: false, error: err.message, code: err.code, fieldErrors: err.fieldErrors };
  }
  // Next.js navigation signals (redirect/notFound) must propagate.
  if (err && typeof err === "object" && "digest" in err && typeof (err as { digest: unknown }).digest === "string") {
    const digest = (err as { digest: string }).digest;
    if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) throw err;
  }
  console.error("[safelease] unexpected error:", err instanceof Error ? err.message : "unknown");
  return { ok: false, error: "Something went wrong. Your data has not been changed.", code: "INTERNAL" };
}

export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".") || "_";
    if (!out[key]) out[key] = i.message;
  }
  return out;
}
