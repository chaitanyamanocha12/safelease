import type { MessageKey } from "@/lib/i18n/dictionaries";

export type NavIcon =
  | "dashboard" | "search" | "compass" | "columns" | "bookmark" | "file-text" | "clipboard" | "wrench" | "piggy" | "scale" | "folder" | "file-down" | "bell" | "building" | "shield" | "settings";

export interface NavItem {
  href: string;
  key: MessageKey;
  icon: NavIcon;
}

export const NAV_GROUPS: Array<{ key: MessageKey; items: NavItem[] }> = [
  {
    key: "nav.group.investigate",
    items: [
      { href: "/dashboard", key: "nav.dashboard", icon: "dashboard" },
      { href: "/investigations", key: "nav.investigations", icon: "search" },
      { href: "/lease-review", key: "nav.leaseReview", icon: "file-text" },
    ],
  },
  {
    key: "nav.group.find",
    items: [
      { href: "/discover", key: "nav.discover", icon: "compass" },
      { href: "/compare", key: "nav.compare", icon: "columns" },
      { href: "/saved", key: "nav.saved", icon: "bookmark" },
    ],
  },
  {
    key: "nav.group.tenancy",
    items: [
      { href: "/move-in", key: "nav.moveIn", icon: "clipboard" },
      { href: "/maintenance", key: "nav.maintenance", icon: "wrench" },
      { href: "/deposit-protection", key: "nav.deposit", icon: "piggy" },
      { href: "/disputes", key: "nav.disputes", icon: "scale" },
    ],
  },
  {
    key: "nav.group.records",
    items: [
      { href: "/documents", key: "nav.documents", icon: "folder" },
      { href: "/reports", key: "nav.reports", icon: "file-down" },
    ],
  },
];
