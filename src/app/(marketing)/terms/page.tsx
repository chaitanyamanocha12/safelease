import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/prose";
import { LEGAL_DISCLAIMER } from "@/server/legal/catalog";

export const metadata: Metadata = { title: "Terms" };

export default function Page() {
  return (
    <MarketingPage eyebrow="Terms of use" title="Using SafeLease">
      <section>
        <h2>Information, not advice</h2>
        <p>{LEGAL_DISCLAIMER}</p>
      </section>
      <section>
        <h2>No guarantees</h2>
        <p>SafeLease cannot guarantee that a listing is genuine, that a landlord is authorized, or that a payment is safe. Absence of warning signs is not evidence of legitimacy. You remain responsible for your decisions.</p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Upload only content you have the right to use.</li>
          <li>Don't use SafeLease to harass landlords or other people, or to publish accusations.</li>
          <li>Don't attempt to access other users' data or interfere with the service.</li>
        </ul>
      </section>
      <section>
        <h2>Demonstration data</h2>
        <p>Listings and cases labeled DEMO are fictional and do not represent real or available rentals.</p>
      </section>
    </MarketingPage>
  );
}
