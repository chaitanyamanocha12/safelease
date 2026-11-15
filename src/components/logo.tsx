import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <defs>
        <linearGradient id="sl-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14B8A6" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#101D34" />
      <path d="M16 6.5 7.5 13v12.5h17V13L16 6.5Z" fill="none" stroke="url(#sl-g)" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="m12 19 3 3 5.5-6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)} aria-label="SafeLease home">
      <LogoMark />
      <span className="text-[17px]">SafeLease</span>
    </Link>
  );
}
