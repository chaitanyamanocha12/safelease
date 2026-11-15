import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/prose";

export const metadata: Metadata = { title: "About" };

export default function Page() {
  return (
    <MarketingPage eyebrow="About" title="Why SafeLease exists" intro="Rental fraud and misunderstood leases hurt people at their most vulnerable moment — when they're moving somewhere new.">
      <section>
        <h2>Our approach</h2>
        <p>Instead of a black-box “scam score”, SafeLease shows its work: what each source says, where they disagree, which official rules apply, and what still hasn't been verified. We'd rather tell you “we don't know yet” than give false comfort.</p>
      </section>
      <section>
        <h2>Agentic AI for good</h2>
        <p>SafeLease is an entry in the Cognizant BrAInstorm Challenge 2026 (“Agentic AI for Good”). Its agent plans, uses tools, reconciles evidence and verifies outcomes — within strict limits, with deterministic legal logic, and with a human in control of every outgoing action.</p>
      </section>
      <section>
        <h2>Starting in Halifax</h2>
        <p>The first jurisdiction is Nova Scotia, starting with Halifax. The rule engine is versioned by jurisdiction so other Atlantic provinces can be added once their rules are verified against official sources.</p>
      </section>
      <section>
        <h2>What we are not</h2>
        <p>We are not a law firm, a property registry, a landlord certification authority or a financial institution. We don't move money and we don't contact landlords on your behalf without your approval.</p>
      </section>
    </MarketingPage>
  );
}
