import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "file:./data/safelease.db";

export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: url.startsWith("file:") ? "sqlite" : "turso",
  dbCredentials: url.startsWith("file:")
    ? { url }
    : { url, authToken: process.env.DATABASE_AUTH_TOKEN },
  strict: true,
});
