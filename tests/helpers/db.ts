/**
 * Per-test-file isolated database + storage. Import this FIRST in a test file
 * (before any module that imports the db client).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "safelease-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.STORAGE_LOCAL_DIR = path.join(dir, "storage");

export async function migrateTestDb() {
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const { db } = await import("@/server/db/client");
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  return db;
}

export async function createTestUser(name: string, email: string, role: "renter" | "platform_admin" = "renter") {
  const { db } = await import("@/server/db/client");
  const { user } = await import("@/server/db/schema");
  const id = `usr_${Math.random().toString(36).slice(2, 12)}`;
  await db.insert(user).values({ id, name, email, emailVerified: true, role });
  return { id, name, email, role };
}
