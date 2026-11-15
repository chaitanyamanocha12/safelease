import "server-only";
import { z } from "zod";
import { AppError, toActionError, zodFieldErrors, type ActionResult } from "../errors";
import { requireApiUser, type SessionUser } from "../auth/session";
import { rateLimit } from "../security/rate-limit";

/** Wraps a server action: auth, optional rate limit, zod validation, structured errors. */
export function action<S extends z.ZodTypeAny, T>(
  schema: S,
  handler: (user: SessionUser, input: z.infer<S>) => Promise<T>,
  opts: { rateLimit?: { key: string; max: number; windowMs: number } } = {},
) {
  return async (raw: unknown): Promise<ActionResult<T>> => {
    try {
      const user = await requireApiUser();
      if (opts.rateLimit) rateLimit(`${opts.rateLimit.key}:${user.id}`, opts.rateLimit.max, opts.rateLimit.windowMs);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new AppError("VALIDATION", "Please check the highlighted fields.", { fieldErrors: zodFieldErrors(parsed.error.issues) });
      const data = await handler(user, parsed.data);
      return { ok: true, data };
    } catch (err) {
      return toActionError(err);
    }
  };
}

export function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (out[k] !== undefined) out[k] = ([] as unknown[]).concat(out[k], v);
    else out[k] = v;
  }
  return out;
}
