# Security

SafeLease handles leases, conversations, addresses and identity-adjacent data, so its defaults favour privacy. This file describes what is implemented and what still needs work before production. Automated tests passing does **not** mean the system is production-safe.

## Implemented controls

- **Authentication.** Better Auth with email and password:
  - passwords hashed with scrypt, 10-character minimum;
  - database-backed sessions in HTTP-only cookies, `Secure` in production, `safelease` prefix;
  - built-in rate limits on sign-in (8/min), sign-up (5/min) and password reset (3/5 min);
  - password reset only when an email provider is configured (`dev_log` writes the link to the server console in development).
- **Authorization.**
  - Every page, server action and route handler calls `requireUser` / `requireApiUser`, then scopes queries by owner in the service layer.
  - Foreign resources return `NOT_FOUND`, so their existence isn't leaked.
  - Platform admin is checked with `requirePlatformAdmin` / `assertPlatformAdmin`, and organization roles with `requireOrgRole`.
  - `proxy.ts` redirects only optimistically; it is **not** the security boundary.
- **Tenant isolation.** Integration tests cover:
  - cross-user access to investigations, claims, documents and reports;
  - consent-gated organization access (redacted scope, immediate revocation);
  - denied-access audit entries.
- **CSRF.** Server Actions get Next.js's built-in Origin check, and Better Auth checks origin/trusted origins. State-changing operations go through POST only.
- **Input validation.** Zod validates every action. Uploads are size-limited (20 MB, 12 files) and typed by magic bytes. File names are sanitized.
- **File privacy.**
  - Storage is private (outside `/public`), and storage keys are validated against path traversal.
  - Files are served only to their owner with `nosniff`, `Content-Security-Policy: sandbox` and `Cache-Control: private, no-store`.
- **SSRF.** Listing-URL fetching:
  - allows http(s) on default ports only, with no credentials in the URL;
  - blocks private, loopback, link-local, metadata and reserved ranges (IPv4 and IPv6, including mapped addresses) after DNS resolution;
  - re-validates on every redirect, limited to 3;
  - caps size and time, and accepts only HTML/text;
  - refuses platforms that require login or restrict automated access.
- **Prompt injection.**
  - Untrusted content is wrapped in `<untrusted_content>` (attempts to close the tag are neutralized) under a fixed security policy.
  - Outputs are JSON-schema-validated with tool names restricted by an enum.
  - LLM claims must quote the source verbatim.
  - AI summaries and drafts that assert certainty ("verified", "safe", "scam") are discarded.
  - Embedded instructions are detected and surfaced as a finding.
  - The LLM has no tools for the filesystem, shell or network.
- **Tool permissions.** Each agent tool declares a permission (`read_case`, `write_case`, `external_read`, `propose_action`). Nothing sends messages or moves money; outgoing email requires explicit approval and then a separate send action.
- **Logging.**
  - Audit metadata passes through `redactMetadata`, which removes bodies, text, contacts and tokens.
  - LLM usage logs record token counts only.
  - Errors returned to clients are generic.
- **Headers.** CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP. The `X-Powered-By` header is disabled.
- **CSV injection.** Exported cells that start with `= + - @` are prefixed.
- **Secrets.** All secrets are read server-side only (`server/env.ts`). `.env*` is gitignored (except `.env.example`), and the admin UI never shows secrets.

## Known gaps / production hardening (not done)

1. **Rate limiting is in-memory per process.** Use a shared store (Redis, or Better Auth's `rateLimit.storage = "database"`) on multi-instance hosting.
2. **DNS-rebinding window.** The URL fetcher resolves the host, then `fetch` resolves again. Pin the resolved IP with a custom undici dispatcher, or disable `URL_FETCH_ENABLED`.
3. **CSP allows `'unsafe-inline'` scripts.** Move to nonce-based CSP via `proxy.ts` for stricter protection.
4. **No email verification or 2FA** on sign-up. Better Auth plugins exist and need an email provider.
5. **No malware scanning** of uploads. Add ClamAV or a cloud scanner before accepting public uploads.
6. **Encryption at rest:** local SQLite and files are not encrypted by the app. Use encrypted volumes, Turso encryption or S3 SSE/KMS.
7. **Background runs** use `after()` in-process. A crash marks runs failed after 5 minutes (stale sweep). Use a durable queue for production.
8. **Organization invites:** the link is shown to the admin to share manually when email isn't configured.
9. A formal penetration test and accessibility audit have not been performed. WCAG conformance is not claimed.

## Reporting

Report security issues privately to the deployment operator (set `CONTACT_EMAIL`). Don't include real personal data in reports.
