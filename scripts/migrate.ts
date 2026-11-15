/**
 * Applies Drizzle migrations from ./drizzle to DATABASE_URL.
 * Usage: npm run db:migrate
 */
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb } from "../src/server/db/client";

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./data/safelease.db";
  const { db, client } = createDb(url, process.env.DATABASE_AUTH_TOKEN || undefined);
  if (url.startsWith("file:")) await client.execute("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log(`[safelease] migrations applied to ${url.startsWith("file:") ? url : "(remote libSQL database)"}`);
  client.close();
}

main().catch((err) => {
  console.error("[safelease] migration failed:", err);
  process.exit(1);
});
