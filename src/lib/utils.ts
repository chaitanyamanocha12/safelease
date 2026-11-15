import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: Date | string | number | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (d === null || d === undefined || d === "") return "—";
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-CA", opts);
}

export function formatDateTime(d: Date | string | number | null | undefined) {
  return formatDate(d, { dateStyle: "medium", timeStyle: "short" });
}

export function relativeTime(d: Date | string | number | null | undefined) {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const s = Math.round(ms / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(d);
}

export function titleCase(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
