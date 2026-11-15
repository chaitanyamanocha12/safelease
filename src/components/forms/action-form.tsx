"use client";
/**
 * Generic form wrapper for server actions returning ActionResult.
 * mode="formdata" passes FormData (for uploads); mode="object" converts fields
 * to a plain object (checkbox names in `booleans` become true/false).
 */
import { useRef, useState } from "react";
import { FormPendingContext } from "./form-pending";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/server/errors";

type AnyAction = (arg: never) => Promise<ActionResult<unknown>>;

export function ActionForm({
  action,
  mode = "object",
  booleans = [],
  extra,
  children,
  success = "Saved",
  redirectTo,
  reset = true,
  className,
  onDone,
}: {
  action: AnyAction;
  mode?: "object" | "formdata";
  booleans?: string[];
  extra?: Record<string, string | boolean | number | undefined>;
  children: React.ReactNode | ((state: { pending: boolean; errors: Record<string, string> }) => React.ReactNode);
  success?: string;
  /** Path to navigate to on success; "{id}" (or any "{key}") is replaced from the result data. */
  redirectTo?: string;
  reset?: boolean;
  className?: string;
  onDone?: (data: unknown) => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <form
      ref={ref}
      className={className}
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        let arg: unknown = fd;
        if (mode === "object") {
          const o: Record<string, unknown> = {};
          for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
          for (const b of booleans) o[b] = fd.get(b) === "on" || fd.get(b) === "true";
          Object.assign(o, extra ?? {});
          arg = o;
        } else if (extra) {
          for (const [k, v] of Object.entries(extra)) if (v !== undefined) fd.set(k, String(v));
        }
        setPending(true);
        const r = await (action as (a: unknown) => Promise<ActionResult<unknown>>)(arg);
        setPending(false);
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          toast.error(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error);
          return;
        }
        setErrors({});
        if (success) toast.success(success);
        if (reset) ref.current?.reset();
        onDone?.(r.data);
        const data = (r.data ?? {}) as Record<string, unknown>;
        const to = redirectTo ? redirectTo.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(String(data[k] ?? ""))) : null;
        if (to) router.push(to);
        else router.refresh();
      }}
    >
      <FormPendingContext.Provider value={pending}>{typeof children === "function" ? children({ pending, errors }) : children}</FormPendingContext.Provider>
    </form>
  );
}
