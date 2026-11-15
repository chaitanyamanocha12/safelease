/** Data export and account deletion (removes stored files too). */
import fs from "node:fs";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import * as s from "../db/schema";
import { storage } from "../storage";
import { env } from "../env";
import { audit } from "./audit";

export async function exportUserData(userId: string) {
  const [u] = await db.select({ id: s.user.id, name: s.user.name, email: s.user.email, createdAt: s.user.createdAt, locale: s.user.locale }).from(s.user).where(eq(s.user.id, userId));
  const invs = await db.select().from(s.investigation).where(eq(s.investigation.ownerId, userId));
  const ids = invs.map((i) => i.id);
  const pick = async <T,>(q: Promise<T[]>) => q;
  const data = {
    exportedAt: new Date().toISOString(),
    notice: "Complete export of your SafeLease data. Uploaded files are listed by name; download them individually from the Document vault.",
    user: u,
    profile: await pick(db.select().from(s.userProfile).where(eq(s.userProfile.userId, userId))),
    investigations: invs,
    evidence: ids.length ? await db.select().from(s.evidence).where(inArray(s.evidence.investigationId, ids)) : [],
    claims: ids.length ? await db.select().from(s.claim).where(inArray(s.claim.investigationId, ids)) : [],
    findings: ids.length ? await db.select().from(s.finding).where(inArray(s.finding.investigationId, ids)) : [],
    verificationChecks: ids.length ? await db.select().from(s.verificationCheck).where(inArray(s.verificationCheck.investigationId, ids)) : [],
    events: ids.length ? await db.select().from(s.investigationEvent).where(inArray(s.investigationEvent.investigationId, ids)) : [],
    documents: (await db.select().from(s.document).where(eq(s.document.ownerId, userId))).map((d) => ({ ...d })),
    messageDrafts: await db.select().from(s.messageDraft).where(eq(s.messageDraft.ownerId, userId)),
    communications: await db.select().from(s.communication).where(eq(s.communication.ownerId, userId)),
    savedProperties: await db.select().from(s.savedProperty).where(eq(s.savedProperty.userId, userId)),
    savedSearches: await db.select().from(s.savedSearch).where(eq(s.savedSearch.userId, userId)),
    leases: await db.select().from(s.lease).where(eq(s.lease.ownerId, userId)),
    tenancies: await db.select().from(s.tenancy).where(eq(s.tenancy.ownerId, userId)),
    maintenance: await db.select().from(s.maintenanceCase).where(eq(s.maintenanceCase.ownerId, userId)),
    deposits: await db.select().from(s.depositRecord).where(eq(s.depositRecord.ownerId, userId)),
    disputes: await db.select().from(s.disputeCase).where(eq(s.disputeCase.ownerId, userId)),
    consents: await db.select().from(s.consentGrant).where(eq(s.consentGrant.userId, userId)),
    notifications: await db.select().from(s.notification).where(eq(s.notification.userId, userId)),
  };
  await audit({ actorId: userId, action: "account.export", resourceType: "user", resourceId: userId });
  return data;
}

export async function deleteAccount(userId: string) {
  const versions = await db.select({ key: s.documentVersion.storageKey }).from(s.documentVersion).innerJoin(s.document, eq(s.document.id, s.documentVersion.documentId)).where(eq(s.document.ownerId, userId));
  for (const v of versions) await storage().delete(v.key).catch(() => undefined);
  if (storage().id === "local") fs.rmSync(path.resolve(env().STORAGE_LOCAL_DIR, userId.replace(/[^a-z0-9_-]/gi, "")), { recursive: true, force: true });
  await audit({ actorId: null, action: "account.delete", resourceType: "user", resourceId: userId, metadata: { files: versions.length } });
  await db.delete(s.user).where(eq(s.user.id, userId));
}
