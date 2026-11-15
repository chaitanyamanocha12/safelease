import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing/prose";

export const metadata: Metadata = { title: "Privacy" };

export default function Page() {
  return (
    <MarketingPage eyebrow="Privacy notice" title="How SafeLease handles your data" intro="Plain-language summary for this prototype deployment. An operator running SafeLease in production must publish their own policy.">
      <section>
        <h2>What we store</h2>
        <ul>
          <li>Account details: name, email, hashed password, optional profile preferences.</li>
          <li>Case data you add: listing text, messages, documents, photos, and the statements and findings derived from them.</li>
          <li>Audit logs of security-relevant actions, without document contents or message bodies.</li>
        </ul>
      </section>
      <section>
        <h2>Who can see it</h2>
        <ul>
          <li>Only you. Uploaded files are stored privately and served through authorized requests only.</li>
          <li>Organizations see a case only if you explicitly share it; you choose redacted or full scope and can revoke at any time. Files are never shared.</li>
          <li>Platform administrators can view configuration, audit and aggregate data, not your case contents through the admin tools.</li>
        </ul>
      </section>
      <section>
        <h2>Third-party processing</h2>
        <p>If the operator configures an AI, OCR, search, geocoding, image-search or email provider, the relevant text or images are sent to that provider to perform the request. Each provider's status is shown in the app. With no providers configured, processing stays on the server (including on-server OCR).</p>
      </section>
      <section>
        <h2>Your controls</h2>
        <ul>
          <li>Export all your data (JSON) from Settings → Privacy.</li>
          <li>Soft-delete or permanently delete documents and cases.</li>
          <li>Delete your account, which removes your cases, documents and stored files.</li>
          <li>Optional retention period for closed cases.</li>
        </ul>
      </section>
    </MarketingPage>
  );
}
