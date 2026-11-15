import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/prose";

export const metadata: Metadata = { title: "Contact" };

export default function Page() {
  const email = process.env.CONTACT_EMAIL;
  return (
    <MarketingPage eyebrow="Contact" title="Get in touch">
      <section>
        <h2>About SafeLease</h2>
        {email ? <p>Email <a className="text-blue underline" href={`mailto:${email}`}>{email}</a> for pilots, feedback or security reports.</p> : <p>This prototype deployment has no public contact address configured (set CONTACT_EMAIL). For security issues, see SECURITY.md in the project repository.</p>}
      </section>
      <section>
        <h2>Need help with a tenancy problem now?</h2>
        <ul>
          <li>Nova Scotia Residential Tenancies Program: <a className="text-blue underline" href="tel:+18006704357">1-800-670-4357</a> · <a className="text-blue underline" href="https://novascotia.ca/residential-tenancies-tenants-and-landlords/" target="_blank" rel="noopener noreferrer">novascotia.ca/rta</a></li>
          <li>If you've lost money to a suspected scam, contact your bank immediately and report to local police.</li>
        </ul>
      </section>
    </MarketingPage>
  );
}
