# External integrations

"Tested" below states what was actually exercised in this repository. Unit and integration tests with mocked providers prove the code path, **not** connectivity to the real service. No real third-party credentials were available while this was built.

| Category | Provider | Credentials / config | Configured in this build | What was actually tested | Data sent | Licensing / terms notes | Fallback when unavailable |
|---|---|---|---|---|---|---|---|
| AI language model | Anthropic Claude (`claude-opus-5-5` default, `ANTHROPIC_MODEL` overridable) via `@anthropic-ai/sdk`, structured JSON outputs, server-side refusal fallback (`fallbacks: "default"`) | `ANTHROPIC_API_KEY` | No | Mocked provider: planner selection/skip, supplementary extraction (verbatim-excerpt filter), summary certainty filter, fallback to deterministic planner on failure, per-run call limit | Listing/message/lease text wrapped as untrusted data; planner prompts receive a redacted state summary | Paid API; usage and estimated cost are logged per user (no prompt content) with a daily per-user budget (`LLM_DAILY_USER_BUDGET_USD`) | Deterministic engine, labeled "Deterministic engine (no LLM configured)" |
| OCR | Tesseract.js with bundled English model (`@tesseract.js-data/eng`) | `OCR_PROVIDER=local` (default) | **Yes** | Real OCR of `public/demo/samples/listing-screenshot.png` (≈0.6 s, engine confidence ≈94%); E2E uploads the screenshot | Nothing leaves the server | Apache-2.0 | — |
| OCR | Google Cloud Vision `DOCUMENT_TEXT_DETECTION` | `OCR_PROVIDER=google_vision`, `GOOGLE_CLOUD_VISION_API_KEY` | No | Not tested | Image bytes | Google Cloud terms; paid | Paste text |
| OCR | Claude vision transcription | `OCR_PROVIDER=llm_vision` + Anthropic key | No | Not tested | Image bytes | Anthropic terms | Paste text |
| Web research | Brave Search API | `WEB_SEARCH_PROVIDER=brave`, `BRAVE_SEARCH_API_KEY` | No | Agent path records NOT CONFIGURED honestly (tested) | Contact/business names from the case, never document text | Brave API terms; results stored as unverified leads | Check stays "provider unavailable"; renter searches manually |
| Reverse image search | Google Cloud Vision Web Detection | `IMAGE_MATCH_PROVIDER=google_vision_web`, `GOOGLE_CLOUD_VISION_API_KEY` | No | NOT CONFIGURED path tested | Up to 4 case photos per run | Google Cloud terms | "Search not performed"; local pHash comparison still runs |
| Local image reuse | Built-in pHash/aHash (sharp) | none | **Yes** | Unit tests (near-duplicate, exact, distinct) + seeded Case E | Nothing leaves the server | — | — |
| Geocoding | OpenStreetMap Nominatim | `GEOCODER_PROVIDER=nominatim`, `NOMINATIM_USER_AGENT` (identifying UA required) | No | Not-configured and failure (UNAVAILABLE) paths tested with mocks; no live call made | Address string | [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/): ≤1 req/s (enforced), no bulk; ODbL attribution | Address check "provider unavailable" |
| Routing | openrouteservice (driving, walking) | `ROUTING_PROVIDER=openrouteservice`, `OPENROUTESERVICE_API_KEY` | No | Not tested | Coordinates | ORS terms/attribution | "Not configured"; **transit always shown unavailable** (no transit provider) |
| Map tiles | OpenStreetMap standard tiles via Leaflet | `MAP_TILE_URL`, `MAP_TILE_ATTRIBUTION` | Yes (default OSM tiles) | Rendered in browser screenshots | Tile requests from the browser | [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/): light use only; use a commercial tile provider for production | — |
| Rental listings | SafeLease demo inventory (fictional) | none | **Yes (DEMO)** | Search/filter/rank/compare tests | — | Fictional data, always labeled DEMO | — |
| Rental listings | Licensed partner JSON feed | `RENTAL_FEED_URL`, `RENTAL_FEED_API_KEY`, `RENTAL_FEED_NAME` | No | Local mock HTTP server: normalization, invalid-item skipping, LIVE labeling, UNAVAILABLE on auth failure | Search filters | Requires a data agreement with the provider | Feed shown NOT CONFIGURED/UNAVAILABLE; demo stays labeled |
| Rental platforms | Kijiji, Facebook Marketplace, Rentals.ca, REALTOR.ca | none | Links only | Link generation tested | Nothing — user opens the platform | SafeLease **does not fetch or scrape** these sites; URL fetching explicitly refuses them | Import by pasting text or screenshot |
| Email | Resend | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (verified domain) | No | Not tested | Recipient, subject, body of user-approved messages; reset links | Resend terms | Copy message / "I sent it myself" |
| Email | Dev console log | `EMAIL_PROVIDER=dev_log` | Yes (local `.env`) | Password reset link logged and followed successfully | Server console only | Labeled DEMO; never counts as delivery | — |
| File storage | Local private disk | `STORAGE_PROVIDER=local` | **Yes** | Upload/read/delete, owner-only access, account deletion removes files | — | Not durable on serverless hosts | — |
| File storage | S3-compatible (AWS S3, R2, MinIO) | `STORAGE_PROVIDER=s3`, `S3_*` | No | Not tested | Encrypted at rest (SSE AES256 requested) | Provider terms | — |
| Scheduler | External cron → `GET /api/cron` | `CRON_SECRET` | No | Job runner tested via `runDueJobs`; cron route constant-time secret check | — | — | Manual: `npm run jobs:run` or Admin → Health |
| Property registry | Nova Scotia Property Online | Paid authorized access | **Not integrated** | — | — | Requires a paid account and authorization; ownership ≠ authority to rent | Renter-recorded verification checklist |

## Licensed feed format

`GET RENTAL_FEED_URL` with `Authorization: Bearer RENTAL_FEED_API_KEY` must return:

```json
{ "listings": [ { "id": "abc", "title": "2BR", "city": "Halifax", "rent": 1725, "deposit": 860,
  "bedrooms": 2, "bathrooms": 1, "lat": 44.65, "lng": -63.58, "address": "…", "neighbourhood": "…",
  "url": "https://…", "utilitiesIncluded": ["heat"], "features": [], "availableFrom": "2026-09-01",
  "publishedAt": "2026-08-01T00:00:00Z", "images": ["https://…"] } ] }
```

Items failing validation are skipped. Results are labeled with `RENTAL_FEED_NAME` and their retrieval time.
