"use client";
import * as React from "react";
import { Tooltip as T, Switch as S, Checkbox as C, DropdownMenu as DM, Tabs as TB } from "radix-ui";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Tip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={200}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content sideOffset={6} className="z-50 max-w-xs rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground shadow-lg">
            {content}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}

export function Switch({ id, checked, defaultChecked, onCheckedChange, name, disabled, label }: { id: string; checked?: boolean; defaultChecked?: boolean; onCheckedChange?: (v: boolean) => void; name?: string; disabled?: boolean; label: string }) {
  return (
    <S.Root
      id={id}
      name={name}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 rounded-full bg-input transition-colors data-[state=checked]:bg-teal-strong disabled:opacity-50"
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}

export function Checkbox({ id, checked, defaultChecked, onCheckedChange, name, label }: { id: string; checked?: boolean; defaultChecked?: boolean; onCheckedChange?: (v: boolean) => void; name?: string; label?: string }) {
  return (
    <C.Root
      id={id}
      name={name}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={(v) => onCheckedChange?.(v === true)}
      aria-label={label}
      className="flex size-4 shrink-0 items-center justify-center rounded border border-input bg-card data-[state=checked]:border-teal-strong data-[state=checked]:bg-teal-strong"
    >
      <C.Indicator>
        <Check className="size-3 text-[#04201d]" strokeWidth={3} />
      </C.Indicator>
    </C.Root>
  );
}

export const Dropdown = DM.Root;
export const DropdownTrigger = DM.Trigger;
export function DropdownContent({ children, align = "end" }: { children: React.ReactNode; align?: "start" | "end" }) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className="z-50 min-w-48 rounded-lg border border-border bg-card p-1 shadow-xl">
        {children}
      </DM.Content>
    </DM.Portal>
  );
}
export function DropdownItem({ className, ...p }: React.ComponentProps<typeof DM.Item>) {
  return <DM.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted [&_svg]:size-4", className)} {...p} />;
}
export const DropdownSeparator = () => <DM.Separator className="my-1 h-px bg-border" />;
export const DropdownLabel = ({ children }: { children: React.ReactNode }) => <DM.Label className="px-2 py-1.5 text-xs text-muted-foreground">{children}</DM.Label>;

export const Tabs = TB.Root;
export function TabsList({ className, ...p }: React.ComponentProps<typeof TB.List>) {
  return <TB.List className={cn("inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted p-1", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof TB.Trigger>) {
  return <TB.Trigger className={cn("rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm", className)} {...p} />;
}
export const TabsContent = TB.Content;
