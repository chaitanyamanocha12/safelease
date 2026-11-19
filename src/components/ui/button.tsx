import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform,filter] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(16_29_52/0.25),0_0_0_1px_rgb(16_29_52/0.9)] hover:brightness-125 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(0_0_0/0.4)] dark:hover:brightness-110",
        teal: "bg-gradient-to-b from-[#2dd4bf] to-teal-strong text-[#04201d] shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_1px_2px_rgb(4_32_29/0.25),0_0_0_1px_rgb(13_148_136/0.6)] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_4px_16px_-4px_rgb(20_184_166/0.55),0_0_0_1px_rgb(13_148_136/0.7)] hover:brightness-105",
        secondary: "bg-secondary text-secondary-foreground hover:bg-muted border border-border shadow-[inset_0_1px_0_var(--highlight)]",
        outline: "border border-border bg-card hover:bg-muted hover:border-input text-foreground shadow-[inset_0_1px_0_var(--highlight),0_1px_2px_rgb(16_29_52/0.04)]",
        ghost: "hover:bg-muted text-foreground",
        destructive: "bg-bad text-white hover:opacity-90",
        link: "text-blue underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});
Button.displayName = "Button";
