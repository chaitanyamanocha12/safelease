"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/server/errors";

/** Calls a typed server action with fixed args. */
export function SimpleActionButton({ action, args, success, redirectTo, children, ...p }: Omit<ButtonProps, "onClick"> & { action: (a: never) => Promise<ActionResult<unknown>>; args: Record<string, unknown>; success?: string; redirectTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...p}
      disabled={busy || p.disabled}
      onClick={async () => {
        setBusy(true);
        const r = await (action as (a: unknown) => Promise<ActionResult<unknown>>)(args);
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        if (success) toast.success(success);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}
