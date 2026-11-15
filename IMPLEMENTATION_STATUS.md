# Implementation status

Legend: COMPLETE · TESTED (complete + automated tests) · PARTIALLY COMPLETE · BLOCKED BY EXTERNAL DEPENDENCY · NOT IMPLEMENTED

| Area | Status | Notes |
|---|---|---|
| Project setup, scripts, Drizzle migrations, seed, demo reset | TESTED | `npm run check` passes |
| Authentication (signup, login, logout, sessions, roles, protected routes, password change) | TESTED | Better Auth; E2E covered |
| Password reset | COMPLETE | Works via `dev_log` (verified manually); real delivery is BLOCKED BY EXTERNAL DEPENDENCY (email provider credentials) |
| Rental investigation: paste, upload (OCR/PDF), messages, manual entry, corrections, provenance | TESTED | |
| Listing URL ingestion | COMPLETE | SSRF guard unit-tested; live fetch of a public page not exercised in tests |
| Investigation graph and board (claims, links, findings, timeline, history, human review) | TESTED | |
| Agent orchestrator (budgets, timeouts, idempotency, cancellation, re-planning, approvals, verification) | TESTED | |
| LLM planning / extraction / summaries / draft polishing | PARTIALLY COMPLETE | Implemented and tested with a mocked provider; BLOCKED BY EXTERNAL DEPENDENCY for live testing (no `ANTHROPIC_API_KEY`) |
| NS rule engine (versioned rules, review workflow, citations, deterministic tests) | TESTED | Sources verified 2026-11-15 |
| Lease analyzer (clauses, pages, comparison, revisions, export) | TESTED | |
| Landlord verification workflow and checklist | TESTED | Property Online registry: BLOCKED BY EXTERNAL DEPENDENCY (paid authorized access) |
| Address check, web research, reverse image search, routing | BLOCKED BY EXTERNAL DEPENDENCY | Adapters implemented; NOT CONFIGURED / failure paths tested |
| Local image reuse (pHash) | TESTED | |
| Discover (filters, map, demo labels, external links, import, saved searches) | TESTED | |
| Licensed listing feed | COMPLETE | Tested against a local mock server; needs a real data agreement |
| Comparison with explainable weighted ranking | TESTED | Commute times not estimated without a routing provider |
| Before-you-pay review | TESTED | |
| Communications (drafts, approval, copy, mark-sent, email send) | TESTED | Real email delivery BLOCKED BY EXTERNAL DEPENDENCY (Resend key) |
| Notifications and monitoring jobs (manual runner, admin button, cron endpoint) | TESTED | Automatic scheduling requires an external cron + `CRON_SECRET` |
| Move-in/out inspections, maintenance, deposits, disputes | TESTED | |
| Document vault (versions, tags, search, trash, permanent delete, export all data) | TESTED | |
| Organization portal (consent, redaction, revocation, notes, team, invites, aggregates) | TESTED | Invite emails need an email provider; link shown to admin otherwise |
| Admin (providers + live health checks, rules, sources, jobs, audit, flags, demo reset) | COMPLETE | Pages smoke-tested per role |
| Reports (10 types, PDF/CSV/JSON) | TESTED | |
| Light/dark mode, responsive layouts, keyboard/ARIA basics | COMPLETE | Mobile E2E checks no horizontal overflow; no formal WCAG audit |
| French interface | PARTIALLY COMPLETE | Navigation and key labels only; page copy is English |
| S3 storage | COMPLETE | Untested without credentials |
| Production hardening (shared rate limits, nonce CSP, upload scanning, durable queue) | NOT IMPLEMENTED | Listed in SECURITY.md |

## Next steps

1. Add `ANTHROPIC_API_KEY` and run `EVAL_USE_LLM=1 npm run eval:agent` to measure the live LLM path.
2. Configure optional providers and run Admin → Providers → Run live health checks.
3. Extend French translations to page content.
4. Complete the SECURITY.md hardening items before any real deployment.
