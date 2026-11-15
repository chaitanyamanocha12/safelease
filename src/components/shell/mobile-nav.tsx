"use client";
import { useState } from "react";
import { Dialog as D } from "radix-ui";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";
import { SidebarNav } from "./sidebar";

export function MobileNav(props: { labels: Record<string, string>; showOrg: boolean; showAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <D.Content className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-border bg-card p-4 shadow-2xl">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <LogoMark /> SafeLease
            </div>
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">Main application navigation</D.Description>
            <D.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close navigation">
                <X />
              </Button>
            </D.Close>
          </div>
          <SidebarNav {...props} onNavigate={() => setOpen(false)} />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
