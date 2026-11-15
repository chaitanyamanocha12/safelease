import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { user, userProfile } from "../db/schema";

export async function getProfile(userId: string) {
  const [p] = await db.select().from(userProfile).where(eq(userProfile.userId, userId));
  return p ?? null;
}

export async function saveProfile(userId: string, patch: Partial<typeof userProfile.$inferInsert>) {
  const { userId: _u, ...safe } = patch;
  void _u;
  await db.insert(userProfile).values({ userId, ...safe }).onConflictDoUpdate({ target: userProfile.userId, set: { ...safe, updatedAt: new Date() } });
}

export async function updateUserBasics(userId: string, patch: { name?: string; locale?: "en" | "fr" }) {
  await db.update(user).set({ ...patch, updatedAt: new Date() }).where(eq(user.id, userId));
}
