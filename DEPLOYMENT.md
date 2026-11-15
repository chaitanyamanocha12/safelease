# Deployment

No production deployment has been made from this repository. These are the instructions for doing one.

## Requirements

- **Node.js 22.12+ server.** SafeLease uses Server Actions, `after()` for agent runs, `sharp` and `tesseract.js` (native/WASM), so it needs a long-lived Node runtime: a VM or container (Fly.io, Render, Railway, a Docker host).
  - Serverless platforms work with caveats: background runs are limited by function duration (`maxDuration`), and local disk is ephemeral.
- **Database:** libSQL. Use Turso or a self-hosted `sqld`. A local SQLite file is **not** suitable on ephemeral or serverless hosts.
- **File storage:** an S3-compatible bucket (`STORAGE_PROVIDER=s3`), or a persistent volume for `STORAGE_LOCAL_DIR` on a single server.

## Steps

1. **Provision the database.**
   - Example with Turso: `turso db create safelease`, then `turso db tokens create safelease`.
   - Set `DATABASE_URL=libsql://…` and `DATABASE_AUTH_TOKEN=…`.
2. **Set environment variables** (see `.env.example`):
   - `APP_URL` (the public https URL);
   - `BETTER_AUTH_SECRET` (`openssl rand -base64 32`);
   - `DEMO_MODE=false`;
   - `STORAGE_PROVIDER=s3` with the `S3_*` variables;
   - any optional providers.
3. **Build and migrate.**
   ```bash
   npm ci
   npm run db:migrate          # applies ./drizzle to DATABASE_URL
   npm run db:seed             # reference data only when DEMO_MODE=false
   npm run build
   npm start                   # PORT env supported by next start
   ```
4. **Create the first platform admin.** Sign up normally, then promote the account in the database:
   ```sql
   UPDATE user SET role = 'platform_admin' WHERE email = 'you@example.org';
   ```
5. **Scheduler (optional).**
   - Set `CRON_SECRET`.
   - Configure your platform's cron to call `GET /api/cron` with the header `Authorization: Bearer $CRON_SECRET` every 15–60 minutes. Vercel Cron, GitHub Actions or a system crontab with curl all work.
   - Without this, jobs run only via Admin → Health or `npm run jobs:run`.
6. **Map tiles.** Replace the default OpenStreetMap tile URL with a commercial or self-hosted tile provider for production traffic (`MAP_TILE_URL`, `MAP_TILE_ATTRIBUTION`).
7. **Hardening.** Work through the "Known gaps" section of SECURITY.md before handling real renters' data: shared rate-limit store, nonce CSP, upload scanning, backups, monitoring.

## Docker (example)

```dockerfile
FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm start"]
```

## Backups and retention

- Back up the libSQL database and the storage bucket on the same schedule.
- The `retention_cleanup` job deletes closed cases for users who chose a retention period.
- Account deletion removes database rows (cascading) and stored file bytes.
