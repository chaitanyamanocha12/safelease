"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, ShieldCheck, User } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/controls";

export function UserMenu({ name, email, signOutLabel, isAdmin }: { name: string; email: string; signOutLabel: string; isAdmin: boolean }) {
  const router = useRouter();
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "U";
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button className="flex size-9 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white ring-offset-2 dark:bg-teal-strong dark:text-[#04201d]" aria-label={`Account menu for ${name}`}>
          {initials}
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>
          <div className="font-medium text-foreground">{name}</div>
          <div className="truncate">{email}</div>
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href="/profile"><User /> Profile</Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/settings"><Settings /> Settings</Link>
        </DropdownItem>
        {isAdmin ? (
          <DropdownItem asChild>
            <Link href="/admin"><ShieldCheck /> Admin</Link>
          </DropdownItem>
        ) : null}
        <DropdownSeparator />
        <DropdownItem
          onSelect={async () => {
            await authClient.signOut();
            router.push("/login?signedOut=1");
            router.refresh();
          }}
        >
          <LogOut /> {signOutLabel}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
