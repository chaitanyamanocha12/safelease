# SafeLease — *Investigate before you pay.*

SafeLease is an AI-assisted rental investigation and tenant-protection web app for renters in Halifax and Nova Scotia. It investigates listings with evidence instead of guesswork. It extracts what each source says, compares the sources, applies verified Nova Scotia tenancy rules, runs the checks available to it, and keeps every uncertainty visible. It then helps you act (questions, drafts, alternatives) without doing anything on your behalf.

Built for the **Cognizant BrAInstorm Challenge 2026: "Agentic AI for Good"**.

> SafeLease is decision support. It is not a lawyer, a property registry, a landlord certification authority or a financial institution. It never declares a listing safe or fraudulent, and it never moves money or sends messages without explicit approval.

## What's inside

- **Rental investigation.** You can paste text, add public links (SSRF-guarded), upload screenshots (on-server OCR), photos and PDFs. Each extracted claim keeps its source excerpt and line/page.
- **Investigation graph.** Evidence → claims → findings are stored as real records, with supports/contradicts/updates/corrects links. Evidence is append-only, and a revised document supersedes the old one without overwriting it.
- **Bounded agent.** It loops observe → plan → execute → reconcile → evaluate → propose → verify → persist. Iteration, tool-call and timeout budgets apply, along with cancellation, idempotent tool runs and one active run per case. The planner is optional and LLM-assisted; the deterministic safety checks are mandatory.
- **Nova Scotia rule engine.** Versioned rules, with deterministic logic and an official citation for each one:
  - deposit limits
  - application-fee ban
  - temporary 5% rent cap
  - rent-increase notice
  - deposit return timeline
  - entry, late-fee and SIN guidance
- **Lease analyzer.** Clause classification, page references, lease-vs-listing comparison and revision diffs.
- **Discover, map, compare and saved.** The demo inventory is always labeled DEMO. A licensed-feed adapter is included, and platform search links are offered without scraping.
- **Verification workflow.** Covers rental authority, local image-reuse detection (pHash), and optional address, web-research and reverse-image providers.
- **Before-you-pay review and communications.** Drafts are never auto-sent, and "submitted" is shown only after the provider acknowledges the message.
- **Tenancy tools.** Move-in/move-out inspections, maintenance tracking, deposit protection and dispute evidence packages.
- **Private document vault.** Versions, tags, search, soft delete and permanent deletion.
- **Organization portal.** Consent-based, revocable sharing, adviser notes, and aggregates with small-count suppression.
- **Admin.** Providers and health checks, rule review workflow, sources, jobs and audit log.
- **Reports.** Ten report types as PDF, plus CSV and JSON exports.

## Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict |
| UI | Tailwind CSS 4, Radix UI primitives (shadcn-style), Lucide, Sonner, Recharts, Leaflet / react-leaflet |
| Forms & validation | React Hook Form, Zod 4 |
| Data | Drizzle ORM + libSQL (local SQLite file; Turso/libSQL for hosting) |
| Auth | Better Auth (email + password, DB sessions, rate limiting) |
| AI | Anthropic Claude via `@anthropic-ai/sdk` (structured JSON outputs), optional |
| Documents | unpdf (PDF text), tesseract.js (bundled English model, offline OCR), sharp (image fingerprints), pdf-lib (reports) |
| Tests | Vitest, Testing Library, Playwright |

## Prerequisites

- Node.js **22.12+** (developed on 24.22 LTS) and npm.
  - On macOS with Homebrew: `brew install node@24`, then add `/opt/homebrew/opt/node@24/bin` to your `PATH`.
- No cloud accounts are required to run locally.

## Install and run

```bash
npm install
cp .env.example .env              # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate                # creates ./data/safelease.db
npm run db:seed                   # legal rules + (DEMO_MODE=true) the demo environment
npm run dev                       # http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

### Scripts

| Script | Purpose |
|---|---|
| `dev` / `build` / `start` | Next.js dev server, production build, production server |
| `lint` / `typecheck` | ESLint; `next typegen` + `tsc --noEmit` |
| `test` | Vitest: unit, integration, agent and component tests |
| `test:e2e` | Playwright (runs `scripts/e2e-server.sh` on port 3100 with an isolated DB; run `npm run build` first) |
| `db:migrate` / `db:seed` / `db:reset-demo` | Apply migrations / seed reference + demo data / wipe and re-seed demo data only |
| `jobs:run` | Run due monitoring jobs once (local scheduler) |
| `eval:agent` | Agent evaluation on the labeled fixture set → `eval-results.json` |
| `check` | lint + typecheck + test + build |

## Environment variables

All are documented in [`.env.example`](.env.example).
- **Required:** `BETTER_AUTH_SECRET`. A dev-only fallback exists, and production refuses to start without it.
- **Optional providers:** every other provider is optional. When one is unconfigured it shows **NOT CONFIGURED** and the rest of the app keeps working.
- **Demo mode:** `DEMO_MODE=true` enables the seeded demo accounts, the demo sign-in button and demo reset. Keep it off in production.

## Demo

See [DEMO_GUIDE.md](DEMO_GUIDE.md). Quick start:
1. Set `DEMO_MODE=true`.
2. Run `npm run db:seed`.
3. Open `/login` and click **Continue with the demo student account**.

All demo accounts use the password `SafeLeaseDemo-2026`:
- Student: `demo.student@safelease.demo`
- Adviser: `demo.adviser@safelease.demo`
- Platform admin: `demo.admin@safelease.demo`

## Provider status behaviour

Every integration reports one of these statuses:
- **LIVE**: configured. Real connectivity is confirmed only by a successful health check in Admin → Providers.
- **NOT CONFIGURED**
- **UNAVAILABLE**
- **DEMO**
- **ERROR**

A failed live provider is never replaced with fabricated results. Tool runs record `not_configured` / `provider_unavailable` honestly, and anything from demo data stays labeled DEMO. See [API_INTEGRATIONS.md](API_INTEGRATIONS.md).

## Known limitations

- **AI path:** the LLM path is implemented and tested with a mocked provider only. No real Anthropic key was available, so live model quality is unverified. Without a key, the clearly labeled deterministic engine runs.
- **External providers:** Google Vision, Brave, Nominatim, openrouteservice, Resend, S3 and licensed feeds are implemented but untested against real services (see API_INTEGRATIONS.md).
- **Registry access:** Nova Scotia's Property Online registry needs paid authorized access, so SafeLease cannot check ownership. Rental authority stays "not independently verified" unless the renter records their own verification.
- **OCR:** on-server OCR (English Tesseract) is accurate on clear screenshots and weaker on photos. Scanned PDFs need page images.
- **Single-instance assumptions:** local SQLite and local file storage are for development or single-server use only. On serverless, use libSQL/Turso and S3-compatible storage. Background runs use `after()` in-process (see DEPLOYMENT.md / SECURITY.md).
- **French:** French covers the navigation and key interface labels only. Most page copy is English.
- **Production readiness:** passing tests and a working local demo do not make this production-ready. See SECURITY.md for the remaining hardening steps.

More: [ARCHITECTURE.md](ARCHITECTURE.md) · [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) · [SECURITY.md](SECURITY.md) · [TESTING.md](TESTING.md) · [DEPLOYMENT.md](DEPLOYMENT.md)
