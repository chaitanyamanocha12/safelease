# Testing

Last verified run: 2026-11-15, Node 24.22.3, macOS arm64.

| Command | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | pass |
| `npm test` (Vitest) | **11 files, 93 tests passed** |
| `npm run build` | pass |
| `npm run test:e2e` (Playwright; after `npm run build`) | **4 passed**: signup/onboarding/logout, wrong-password + admin denial, full 10-step hackathon journey (OCR upload → message → lease PDF → draft → discover → compare → revised lease → PDF report), mobile layout |
| `npm run eval:agent` | 12 labeled fixture cases: 19/19 expected findings detected, 0 missed, 0 false positives (16 forbidden findings correctly absent), legal rule checks 10/10, 12/12 unauthorized access attempts blocked, ~50 ms average investigation (deterministic planner) |

The eval results describe SafeLease's **fictional fixture dataset only**. They are not real-world fraud-detection accuracy.

## Suites

- `tests/unit`: extraction, normalization, NS rule logic (deposit boundary, holding fees, application fee, rent cap incl. new-tenant/expiry, notice), reconciliation, uncertainty preservation, link analysis, questions, ranking, dedupe, geo, money, redaction, SSRF, upload sniffing, CSV injection, PDF text safety, inspections, maintenance analysis, lease analysis, aggregate suppression, image fingerprints, AI certainty filter.
- `tests/integration`: the demo story end to end through the agent (Case F revision), cross-user isolation, consent sharing/revocation (Case J), discovery/compare/import, lease review + versions, tenancy/deposit/dispute, reports, data export + account deletion, before-you-pay, monitoring jobs, partner feed (local mock server).
- `tests/agent`: budget stop, cancellation, unconfigured and failing providers, tool relevance, re-planning, approval-gated actions, prompt-injection resistance, untrusted-content wrapping, LLM hallucinated-claim filtering and unsafe-summary rejection (mocked LLM), deterministic fallback, concurrency.
- `tests/components`: status labels are never color-only, FindingCard sources/citations, accessible chart table.
- `tests/e2e`: see above. The E2E server uses an isolated DB (`data/e2e.db`) and storage.

Mocked-provider tests prove code paths, **not** connectivity to real services.
