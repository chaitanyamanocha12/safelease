import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium [&_svg]:size-3", {
  variants: {
    tone: {
      ok: "border-ok/30 bg-ok-bg text-ok",
      warn: "border-warn/30 bg-warn-bg text-warn",
      bad: "border-bad/30 bg-bad-bg text-bad",
      neutral: "border-neutral/25 bg-neutral-bg text-neutral",
      review: "border-review/30 bg-review-bg text-review",
      info: "border-info/30 bg-info-bg text-info",
      teal: "border-teal/30 bg-accent text-accent-foreground",
      outline: "border-border text-muted-foreground",
      demo: "border-warn/50 bg-warn-bg text-warn font-semibold tracking-wide",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...p} />;
}
