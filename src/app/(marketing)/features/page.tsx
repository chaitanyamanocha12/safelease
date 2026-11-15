import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/prose";

export const metadata: Metadata = { title: "Features" };

const GROUPS: Array<[string, string[]]> = [
  ["Rental investigation", ["Paste text, links (public pages only), screenshots with on-server OCR, photos and PDFs", "Source-linked claims with corrections and history", "Contradiction detection across listing, messages and lease", "Payment-recipient and contact-change detection", "Warning signs: payment pressure, viewing refused, hard-to-reverse payment methods, sensitive-information requests, suspicious links"]],
  ["Nova Scotia rules", ["Deposit maximum (half a month's rent) and deemed deposits", "Application-fee prohibition", "Temporary 5% rent cap for existing tenants (through Dec 31, 2027)", "Rent-increase frequency and notice", "Deposit return timeline, entry notice and late-fee guidance", "Versioned rules with review workflow and official citations"]],
  ["Verification", ["Rental-authority checklist and history", "Address check (OpenStreetMap Nominatim, when enabled)", "Public business research (when a search provider is configured)", "Local image-reuse detection with perceptual hashing; optional web image search"]],
  ["Leases", ["PDF and text analysis with page references", "Clause classification: clear rule violation, potential issue, unusual term, incomplete extraction, unverified interpretation", "Listing-vs-lease comparison and revision diffs", "Exportable lease review"]],
  ["Finding a home", ["Discover with filters, map and distance from campus anchors", "Saved properties, watchlist and saved searches", "Explainable comparison with adjustable weights", "Platform search links for Kijiji, Facebook Marketplace, Rentals.ca and REALTOR.ca — without scraping"]],
  ["During and after a tenancy", ["Move-in/move-out inspections by room with photos", "Maintenance logs with promise tracking and follow-up drafts", "Deposit tracking with Nova Scotia return timeline", "Dispute evidence packages (PDF)"]],
  ["Privacy & organizations", ["Private document vault with versions, tags, soft delete and permanent deletion", "Consent-based, revocable case sharing (redacted or full)", "Adviser notes and case workflow", "Aggregate insights with minimum group-size suppression"]],
];

export default function Page() {
  return (
    <MarketingPage eyebrow="Features" title="Everything you need to rent with confidence">
      <div className="grid gap-6 sm:grid-cols-2">
        {GROUPS.map(([t, items]) => (
          <section key={t} className="rounded-xl border border-border bg-card p-5">
            <h2>{t}</h2>
            <ul className="text-sm text-muted-foreground">{items.map((i) => <li key={i}>{i}</li>)}</ul>
          </section>
        ))}
      </div>
    </MarketingPage>
  );
}
