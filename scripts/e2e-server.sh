#!/usr/bin/env bash
# Starts an isolated SafeLease server for Playwright (separate DB + storage).
set -euo pipefail
export DATABASE_URL="file:./data/e2e.db"
export STORAGE_LOCAL_DIR="./storage/e2e"
export DEMO_MODE=true
export LLM_PROVIDER=none
export EMAIL_PROVIDER=dev_log
export APP_URL="http://localhost:3100"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-e2e-only-secret-0123456789abcdef0123456789}"
rm -f data/e2e.db data/e2e.db-wal data/e2e.db-shm
rm -rf storage/e2e
npx tsx scripts/migrate.ts
npx tsx scripts/seed.ts
exec npx next start -p 3100
