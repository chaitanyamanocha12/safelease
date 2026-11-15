import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { notification, notificationPreference } from "../db/schema";
import { newId } from "@/lib/ids";

type Category = (typeof notification.$inferInsert)["category"];

/** In-app notification, idempotent by dedupeKey and respecting preferences. */
export async function notify(userId: string, n: { category: Category; title: string; body: string; link?: string | null; dedupeKey?: string | null }) {
  const [pref] = await db.select().from(notificationPreference).where(eq(notificationPreference.userId, userId));
  if (pref && !pref.inApp) return false;
  if (pref) {
    if (n.category === "deadline" && !pref.deadlineReminders) return false;
    if (n.category === "listing" && !pref.listingUpdates) return false;
    if ((n.category === "case" || n.category === "evidence" || n.category === "verification") && !pref.caseUpdates) return false;
  }
  const res = await db
    .insert(notification)
    .values({ id: newId("ntf"), userId, category: n.category, title: n.title.slice(0, 140), body: n.body.slice(0, 600), link: n.link ?? null, dedupeKey: n.dedupeKey ?? null })
    .onConflictDoNothing()
    .returning({ id: notification.id });
  return res.length > 0;
}

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  const where = opts.unreadOnly ? and(eq(notification.userId, userId), isNull(notification.readAt)) : eq(notification.userId, userId);
  return db.select().from(notification).where(where).orderBy(desc(notification.createdAt)).limit(Math.min(opts.limit ?? 50, 200));
}

export async function unreadCount(userId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(notification).where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return Number(r?.n ?? 0);
}

export async function markRead(userId: string, id?: string) {
  const where = id ? and(eq(notification.userId, userId), eq(notification.id, id)) : and(eq(notification.userId, userId), isNull(notification.readAt));
  await db.update(notification).set({ readAt: new Date() }).where(where);
}

export async function getPreferences(userId: string) {
  const [p] = await db.select().from(notificationPreference).where(eq(notificationPreference.userId, userId));
  return p ?? { userId, inApp: true, email: false, deadlineReminders: true, listingUpdates: true, caseUpdates: true, updatedAt: new Date() };
}

export async function savePreferences(userId: string, p: { inApp: boolean; email: boolean; deadlineReminders: boolean; listingUpdates: boolean; caseUpdates: boolean }) {
  await db
    .insert(notificationPreference)
    .values({ userId, ...p })
    .onConflictDoUpdate({ target: notificationPreference.userId, set: { ...p, updatedAt: new Date() } });
}
