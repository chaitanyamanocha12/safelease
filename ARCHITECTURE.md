# Architecture

## Layout

```
src/
  app/                    Next.js routes
    (marketing)/          public site
    (auth)/               login, signup, password reset
    (app)/                authenticated app (layout enforces session)
    api/                  auth, files, reports, activity polling, export, cron
  components/             UI primitives (ui/), feature components
  lib/                    client-safe helpers (money, geo, discover ranking, i18n)
  server/
    db/                   Drizzle schema (auth, platform, documents, investigations, legal, listings, tenancy)
    auth/                 Better Auth config + session helpers (requireUser / requirePlatformAdmin)
    extraction/           deterministic claim extraction, normalization, PDF/OCR text
    investigation/        pure evaluation: reconcile, indicators, legal-apply, gaps, questions
    legal/                rule catalog (sources + v1 rules), deterministic rule logic, rule lookup
    agent/                orchestrator, planner, tool registry, tools/*
    providers/            LLM, OCR, geocoding, routing, search, image match, listings, email, registry
    services/             business services (all owner-scoped)
    actions/              server actions (validated with Zod)
    reports/              pdf-lib layout engine + report builders
    security/             upload sniffing, SSRF-safe fetch (pinned DNS), redaction, DB-backed rate limiting
    seed/                 reference + demo seed
scripts/                  migrate, seed, reset-demo, jobs, eval, demo assets, e2e server
tests/                    unit, integration, agent, components, e2e, fixtures
```

## Key decisions

1. **Cache Components disabled.** Nearly every route renders private, per-user data. Rendering dynamically per request removes any chance of caching one user's data in a shared shell.
2. **Services, not components, touch the database.** Every service function takes the acting user's id and scopes queries by owner. Foreign or missing resources raise `NOT_FOUND` (never "forbidden") so their existence isn't revealed. Server actions go through `action()`, which wraps auth, an optional rate limit, Zod validation and structured errors.
3. **Deterministic core, optional LLM.**
   - Extraction, reconciliation, legal rules, money math, risk indicators and verification gaps are pure TypeScript functions (`src/server/investigation`, `src/server/legal`). They're tested directly.
   - The LLM (`providers/llm.ts`) is used only to:
     - prioritise *optional* tools;
     - suggest supplementary claims, kept only if their excerpt appears verbatim in the source;
     - write summaries and polish drafts, both rejected if they assert certainty.
   - The LLM is never the source of legal truth.
4. **Investigation graph as relational records.**
   - Data model: `evidence` → `claim` (excerpt, locator, extractor, confidence, status) → `claim_link` (supports / contradicts / updates / corrects) → `finding` (stable `finding_key`, label, severity, lifecycle, rule version + citation).
   - Re-evaluation upserts findings by key. Disappeared findings are marked *resolved* with a reason, never deleted.
   - Evidence is append-only; `supersedes_evidence_id` links new document versions, and user corrections create new claims.
5. **Agent loop** (`agent/orchestrator.ts`):
   - Each iteration walks five phases: ingestion → extraction → evaluation → verification/research → action/reporting.
   - State is reloaded before each phase (observe).
   - Mandatory tools always run when relevant. Optional tools go through the planner, which can only pick from the current candidates; LLM failure falls back to the deterministic planner, with a note.
   - Each tool declares `candidates(state)` with an input hash. A tool already completed for the same hash is never re-run, which makes runs idempotent.
   - Budgets: max iterations, max tool calls and a per-tool timeout.
   - Cancellation is checked before every tool. Only one queued/running run is allowed per case, and stale runs are swept.
   - Outgoing actions are only *proposed* (`investigation_action.status = proposed`). `verify_actions` records real outcomes, such as a provider acknowledgement.
6. **Legal rules are data plus code.**
   - Logic lives in `legal/rules.ts`, keyed by `logic_key`. Metadata (summary, citation, parameters, effective dates, review status, verification date) lives in versioned DB rows.
   - Admins can only *propose* new versions. They take effect after a different admin approves them.
   - Rule versions that aren't verified turn findings into "needs review".
7. **Providers share one contract.** Each has `info()` (LIVE / NOT_CONFIGURED / UNAVAILABLE / DEMO / ERROR, plus required env, timeouts, attribution and data restrictions) and returns `ProviderResult`. HTTP calls use bounded timeouts and retries, and email is never retried.
8. **Files.**
   - Bytes live in private storage (`storage/private` or S3), outside `/public`.
   - They're served only via `/api/files/[versionId]` after an owner check, with `nosniff`, a sandbox CSP and `no-store`.
   - Uploads are typed by magic bytes, not by the client's MIME type.
9. **Background work.**
   - Agent runs start with Next's `after()` and the UI polls `/api/investigations/[id]/activity`. This needs a long-lived Node server; serverless limits apply (see DEPLOYMENT.md).
   - Monitoring jobs run only when triggered: `npm run jobs:run`, the admin button, or `/api/cron` with `CRON_SECRET`.
10. **Privacy for organizations.**
    - Access requires an active `consent_grant` for that specific case, plus an adviser or org-admin role.
    - Redacted scope strips names, addresses, contacts and payment names, and files are never shared.
    - Aggregates suppress any count below the organization's minimum group size (default 5, minimum 3).

## Data flow: new evidence

```
upload/paste ─▶ addEvidence (store doc, extract text via PDF/OCR, append evidence, bump state_version)
            ─▶ createAgentRun ─▶ after(): executeAgentRun
                 analyze_* (claims) ─▶ reconcile / legal / deposit / indicators / gaps ─▶ persistEvaluation
                 verify_address · image_reuse_check · web research · rental_comparison · listing_discovery
                 generate_verification_questions ─▶ prepare_communication (draft, proposed action) ─▶ verify_actions ─▶ summarize_case
UI polls activity ─▶ router.refresh() when run completes
```

## Image reuse

DCT pHash plus aHash (64-bit each), computed with sharp:
- On the demo set, a resized, JPEG re-encoded copy measures distance 4.
- Distinct demo images are at least 16 apart.
- The near-duplicate threshold is ≤ 10.

Matches are reported as "local image match" with any conflicting listing details. A match is never treated as proof of fraud.
