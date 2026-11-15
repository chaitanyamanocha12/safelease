"use client";
import * as React from "react";
import { Dialog as D, AlertDialog as AD } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, title, description, wide }: { className?: string; children: React.ReactNode; title: string; description?: string; wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl",
          wide ? "max-w-3xl" : "max-w-lg",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-lg font-semibold">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close asChild>
            <Button variant="ghost" size="icon" aria-label="Close dialog">
              <X />
            </Button>
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

/** Accessible confirmation modal for destructive or consequential actions. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [pending, setPending] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  return (
    <AD.Root open={open} onOpenChange={setOpen}>
      <AD.Trigger asChild>{trigger}</AD.Trigger>
      <AD.Portal>
        <AD.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AD.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5 shadow-2xl">
          <AD.Title className="text-lg font-semibold">{title}</AD.Title>
          <AD.Description className="mt-2 text-sm text-muted-foreground">{description}</AD.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AD.Cancel asChild>
              <Button variant="outline">Cancel</Button>
            </AD.Cancel>
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
              onClick={async () => {
                setPending(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}
