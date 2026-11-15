import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/marketing/prose";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "For students & newcomers" };

export default function Page() {
  return (
    <MarketingPage eyebrow="For students, newcomers & first-time renters" title="Renting in Halifax from far away" intro="Finding housing before you arrive is hard. Being asked to pay before you can see a place is common — and risky. SafeLease helps you slow down and check.">
      <section>
        <h2>Know the Nova Scotia basics</h2>
        <ul>
          <li>A security deposit can be at most half of one month's rent.</li>
          <li>Landlords can't charge application fees.</li>
          <li>Money a landlord takes on top of rent is treated as a security deposit.</li>
          <li>Landlords can't force you to give your Social Insurance Number.</li>
          <li>The Standard Form of Lease conditions apply to every residential lease.</li>
        </ul>
        <p className="text-sm text-muted-foreground">Summarized from official Nova Scotia sources; SafeLease links to each one. This is information, not legal advice.</p>
      </section>
      <section>
        <h2>Verify before you pay</h2>
        <p>Ask for a viewing — in person or a live video tour. Confirm who manages the property using contact details you find yourself. Be cautious with wire transfers, crypto, gift cards and pressure to pay “today”. SafeLease turns these into a checklist and drafts the questions for you.</p>
      </section>
      <section>
        <h2>After you move in</h2>
        <p>Document the unit room by room with dated photos, track repairs and promises, and keep your deposit timeline. If there's a dispute, generate an organized evidence package.</p>
      </section>
      <Button asChild variant="teal" size="lg"><Link href="/signup">Create a free account</Link></Button>
    </MarketingPage>
  );
}
