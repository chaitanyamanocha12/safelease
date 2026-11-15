# Demo guide

Everything in the demo is fictional:
- names use 555 phone numbers and `.demo` / `example.com` addresses;
- streets are invented or labelled "(fictional)";
- map positions are approximate neighbourhood areas;
- images are generated illustrations.

## Setup

```bash
# .env must contain DEMO_MODE=true
npm run db:migrate
npm run db:seed        # ~3 s; creates demo accounts, 18 demo listings and scenarios A–J
npm run dev            # or: npm run build && npm start
```

To reset at any time, run `npm run db:reset-demo`, or use **Admin → Demo environment → Reset**. Only demo-flagged data is removed.

| Account | Email | Password |
|---|---|---|
| Student (renter) | demo.student@safelease.demo | SafeLeaseDemo-2026 |
| Adviser (student union) | demo.adviser@safelease.demo | SafeLeaseDemo-2026 |
| Platform admin | demo.admin@safelease.demo | SafeLeaseDemo-2026 |

The login page has a **Continue with the demo student account** button whenever `DEMO_MODE=true`.

Sample files for the live demo are in `public/demo/samples/` (also served at `/demo/samples/...`):
- `listing-screenshot.png`
- `landlord-message.txt`
- `lease-v1.pdf`
- `lease-v2-revised.pdf`
- `property-photo.jpg`

They can be regenerated with `npx tsx scripts/generate-demo-assets.ts`.

## Main hackathon story (≈5 minutes, live)

1. **Upload the listing screenshot.**
   - Sign in as the student, then go to **New investigation**, name it, and choose **Continue to evidence**.
   - Pick **Screenshot / photos / PDF** and upload `listing-screenshot.png`.
   - On-server OCR reads it, and the agent extracts rent $1,600, the address, 2 bedrooms and the contact, with line references.
2. **Add the landlord conversation.**
   - Choose the **Landlord message** tab and paste `landlord-message.txt`.
   - The agent re-runs. Watch **Agent activity** list each tool and its mode (Deterministic, Local, or Not configured).
3. **Open the Board.** It shows:
   - serious concerns: pressure to pay quickly; payment requested without a viewing; a $1,200 deposit above the half-month limit (RTA s. 12(2), linked);
   - the payment recipient ("Sarah Whitfield") differs from the advertiser ("Daniel Moreau");
   - the SIN request (official guide);
   - **"Rental authority has not been independently verified."**;
   - the address check reported as *provider unavailable* rather than faked.

   Click nodes in the **Investigation graph** to trace each finding back to its statements and evidence.
4. **Upload the lease.** Upload `lease-v1.pdf` on the **Lease** tab. New findings:
   - *Monthly rent in the lease ($1,850) differs from the advertisement ($1,600)*;
   - a heat/utilities conflict;
   - a late fee above the 1% guidance;
   - entry "at any time".

   Each has a page reference and an official citation.
5. **Next verification question and draft.** The side panel lists prioritised questions. **Communications** contains an agent-prepared draft marked **Draft — not sent**.
6. **Review the message.**
   - Edit, then **Approve**.
   - **Send via email** stays disabled until a provider is configured; with `dev_log` it's clearly marked *not delivered*.
   - **Copy** works everywhere.
7. **Explore other rentals.** Use **Explore alternatives**, or follow the agent's proposed action. Discover opens pre-filtered with a **Showing DEMO inventory** banner, DEMO pins on the map, and Kijiji / Facebook / Rentals.ca / REALTOR.ca links (not scraped).
8. **Compare.**
   - Click **Compare** on a few listings and open **Compare**.
   - Choose **Compare with my original listing**, adjust the weights and read "Why it ranks here".
   - Low rent never counts against legitimacy.
9. **The judge adds new evidence.**
   - Upload `lease-v2-revised.pdf` and select **Replaces: <the first lease>**.
   - The rent, utilities, late-fee and entry findings move to **Resolved** with a note naming the revised document.
   - The deposit concern ($1,200 > $800) remains.
   - The earlier lease stays in Evidence as "superseded, preserved", and the Timeline records every change.
10. **Download the report.** Use **Report (PDF)** in the case header. JSON and CSV are in the ⋯ menu, along with the before-you-pay and verification-checklist reports.

## Seeded scenarios

| Case | Where | What it shows |
|---|---|---|
| A | Investigations → "South End 2BR — RentFinder ad" | Scam pattern: payment pressure, viewing refused, recipient differs, deposit above limit, SIN request, lease rent contradiction |
| B | "Clayton Park 1BR — managed building" | Normal-looking rental: **no warning signs**, but rental authority, viewing and address remain unverified (never called "safe") |
| C | "Pinecrest Drive 1BR — lease check" and Lease review | Lease deposit $1,400 on $1,400 rent; "non-refundable" clause flagged |
| D | "Bedford 3BR townhouse" | Listing $2,100 vs lease $2,350 |
| E | "Downtown Dartmouth 2BR — photo check" → Verification | Uploaded photo is a re-encoded copy of a demo listing image with different rent/address → local image match, explicitly "not proof of fraud" |
| F | "Harbourview Lane — after landlord's reply" | Revised lease resolves the rent contradiction; deposit concern remains |
| G | Case A → Proposed actions | Agent proposes alternatives from demo inventory; four are pre-saved in Compare |
| H | Move-in → "Agricola Street 2BR" and Maintenance | Inspection with pre-existing damage (placeholder images labeled), witness recorded; fan repair with two different promised dates (conflict + overdue flags); draft a follow-up |
| I | Deposit protection and Disputes | $700 deposit, $300 returned, $400 deduction disputed; 10-day deadline; evidence package PDF with move-in vs move-out comparison |
| J | Sign in as the **adviser** → Organization → Cases | Case A shared **redacted** by the student; no names, address, contacts or payment names; revoke as the student from Settings → Privacy and the adviser loses access immediately |

Admin tour (as `demo.admin`):
- Providers: statuses plus **Run live health checks**.
- Legal rules: versions and propose/review. A *different* admin must approve, or set `ALLOW_SELF_REVIEW=true` for a solo demo.
- Sources: verification dates and availability checks.
- Health & jobs: **Run due jobs**.
- Audit log: includes the denied-access entries.

## Talking points

- **Agentic, but bounded.** The agent plans, uses tools, reconciles and re-plans on new evidence. It never sends, pays or claims verification it doesn't have.
- **Evidence over verdicts.** Every finding links to source text and, for rules, the official Nova Scotia source with its verification date.
- **Honest integrations.** Unconfigured providers say so, and demo data is always labeled.
