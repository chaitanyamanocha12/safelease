"use client";
import { useContext } from "react";
import { useFormStatus } from "react-dom";
import { FormPendingContext } from "@/components/forms/form-pending";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";

export function SubmitButton({ children, pendingLabel, ...p }: ButtonProps & { pendingLabel?: string }) {
  const status = useFormStatus();
  const ctx = useContext(FormPendingContext);
  const pending = ctx ?? status.pending;
  return (
    <Button type="submit" disabled={pending || p.disabled} aria-busy={pending} {...p}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}
