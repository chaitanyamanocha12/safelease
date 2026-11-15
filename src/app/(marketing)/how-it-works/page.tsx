import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/marketing/prose";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "How it works" };

export default function Page() {
  return (
    <MarketingPage eyebrow="How it works" title="An investigation, not a verdict" intro="SafeLease runs a bounded, auditable investigation over the evidence you provide — and keeps uncertainty visible at every step.">
      <section>
        <h2>1. Evidence goes in, unchanged</h2>
        <p>Paste listing text, upload screenshots, photos or PDFs, add landlord messages and the lease. Each item is stored privately and never overwritten — a revised lease becomes a new version linked to the old one.</p>
      </section>
      <section>
        <h2>2. Claims are extracted with their source</h2>
        <p>Rent, deposit, address, contacts, payment instructions, urgency and viewing statements are extracted with the exact excerpt and a line or page reference. Extracted is not the same as verified: every claim starts as <strong>unverified</strong>. You can correct anything; corrections are recorded separately.</p>
      </section>
      <section>
        <h2>3. The agent plans and runs checks</h2>
        <p>The orchestrator observes the case, decides which unresolved questions matter, and selects tools from a fixed registry: reconciliation, Nova Scotia rule checks, deposit calculation, address and image checks, public business research, rental comparison and question generation. It works within limits on iterations, tool calls and time, records every tool run, and reports providers that aren't configured as unavailable instead of inventing results.</p>
        <ul>
          <li>Legal checks and money math are deterministic code with official citations — never an AI opinion.</li>
          <li>When an AI model is configured, it can help prioritize optional checks, find extra statements (only if it can quote them verbatim) and polish wording.</li>
          <li>Listing text that tries to instruct the AI is treated as data and flagged.</li>
        </ul>
      </section>
      <section>
        <h2>4. You see a structured investigation</h2>
        <p>The board groups findings into contradictions, tenancy-rule concerns, potential warning signs, and what remains unverified. An interactive graph traces every finding back to the statements and evidence behind it.</p>
      </section>
      <section>
        <h2>5. Nothing happens without you</h2>
        <p>The agent proposes actions — a message with verification questions, monitoring, exploring alternatives. You review, edit and approve. Messages are sent only through a configured provider after approval, and “sent” is only shown when the provider acknowledges it.</p>
      </section>
      <section>
        <h2>6. New evidence, re-investigated</h2>
        <p>When a reply or revised lease arrives, the agent re-runs the affected checks, resolves findings that no longer apply, and records the change in the timeline. Earlier evidence is always preserved.</p>
      </section>
      <Button asChild variant="teal" size="lg"><Link href="/investigations/new">Start an investigation</Link></Button>
    </MarketingPage>
  );
}
