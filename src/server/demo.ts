/** Demo accounts exist only when DEMO_MODE=true (seeded by `npm run db:seed`). */
export const DEMO_ACCOUNTS = {
  renter: { email: "demo.student@safelease.demo", password: "SafeLeaseDemo-2026", name: "Priya Demo (student)" },
  adviser: { email: "demo.adviser@safelease.demo", password: "SafeLeaseDemo-2026", name: "Alex Demo (adviser)" },
  admin: { email: "demo.admin@safelease.demo", password: "SafeLeaseDemo-2026", name: "Morgan Demo (platform admin)" },
} as const;
