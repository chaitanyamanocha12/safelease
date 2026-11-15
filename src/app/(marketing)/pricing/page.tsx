import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { MarketingPage } from "@/components/marketing/prose";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Pricing" };

const PLANS = [
  { name: "Renter", price: "Free", note: "Prototype — no payment system is connected", items: ["Unlimited investigations", "Nova Scotia rule checks", "Lease review", "Discover, compare & saved properties", "Move-in, maintenance & deposit tools", "Data export and deletion"] },
  { name: "Organization", price: "Pilot", note: "For universities, unions and non-profits", items: ["Consent-based case referrals", "Adviser workspace & notes", "Team management", "Privacy-protected aggregate reports", "Branding settings"] },
];

export default function Page() {
  return (
    <MarketingPage eyebrow="Pricing" title="Free for renters" intro="SafeLease is a prototype built for the Cognizant BrAInstorm Challenge 2026. There is no billing integration; organization pricing would be set with pilot partners.">
      <div className="grid gap-6 sm:grid-cols-2">
        {PLANS.map((p) => (
          <div key={p.name} className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <div className="mt-2 text-3xl font-semibold">{p.price}</div>
            <p className="text-sm text-muted-foreground">{p.note}</p>
            <ul className="mt-5 space-y-2 text-sm">
              {p.items.map((i) => (
                <li key={i} className="flex list-none gap-2 !ml-0"><Check className="mt-0.5 size-4 text-teal" aria-hidden /> {i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Optional AI features use your server's configured model provider and are subject to that provider's pricing; per-user daily usage limits are enforced.</p>
      <Button asChild variant="teal"><Link href="/signup">Get started</Link></Button>
    </MarketingPage>
  );
}
