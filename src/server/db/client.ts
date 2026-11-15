/**
 * Database client (Drizzle + libSQL).
 * Local development uses a SQLite file; hosted deployments point DATABASE_URL
 * at a libSQL/Turso database (a local file is NOT durable on serverless hosts).
 */
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient, type Client } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __safeleaseDb?: DB; __safeleaseClient?: Client };

export function createDb(url: string, authToken?: string): { db: DB; client: Client } {
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    if (filePath && !filePath.startsWith(":memory:")) {
      fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
    }
  }
  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema });
  return { db, client };
}

function init(): DB {
  const url = process.env.DATABASE_URL ?? "file:./data/safelease.db";
  const { db, client } = createDb(url, process.env.DATABASE_AUTH_TOKEN || undefined);
  if (url.startsWith("file:")) {
    // Improve concurrency for local SQLite; ignore failures on remote/libSQL.
    client.execute("PRAGMA journal_mode = WAL").catch(() => undefined);
    client.execute("PRAGMA foreign_keys = ON").catch(() => undefined);
    client.execute("PRAGMA busy_timeout = 5000").catch(() => undefined);
  }
  globalForDb.__safeleaseClient = client;
  return db;
}

export const db: DB = globalForDb.__safeleaseDb ?? (globalForDb.__safeleaseDb = init());

export function rawClient(): Client {
  void db;
  return globalForDb.__safeleaseClient!;
}

export { schema };
