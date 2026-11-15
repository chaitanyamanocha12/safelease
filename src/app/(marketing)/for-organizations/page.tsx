import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/marketing/prose";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "For organizations" };

export default function Page() {
  return (
    <MarketingPage eyebrow="For universities, student unions & housing organizations" title="Support renters without compromising their privacy">
      <section>
        <h2>Consent first</h2>
        <p>An organization account never grants access to members' cases. A renter shares a specific case with your organization — redacted or in full — and can revoke it at any time. Every view of a shared case is audit-logged.</p>
      </section>
      <section>
        <h2>Adviser workflow</h2>
        <ul>
          <li>Referral queue with review status: new, in review, awaiting renter, closed</li>
          <li>Adviser notes, optionally visible to the renter</li>
          <li>Team roles: organization administrator, adviser, member; invitations by email link</li>
        </ul>
      </section>
      <section>
        <h2>Aggregate insights with disclosure control</h2>
        <p>See common patterns — deposits above the legal limit, application fees, payment pressure — across consented cases only. Any group smaller than your minimum threshold (default 5) is suppressed.</p>
      </section>
      <Button asChild size="lg"><Link href="/contact">Talk to us about a pilot</Link></Button>
    </MarketingPage>
  );
}
