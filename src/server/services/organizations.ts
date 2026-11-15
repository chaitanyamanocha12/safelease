/**
 * Organizations, membership, invitations, consent-based case sharing,
 * adviser workflow and privacy-preserving aggregates.
 *
 * Privacy invariants:
 *  - Membership never grants access to a member's cases.
 *  - Access requires an ACTIVE consent grant for that specific case + org,
 *    and the viewer must be an active adviser/org_admin of that org.
 *  - Revocation takes effect immediately.
 *  - Aggregates suppress any cell below the org's minimum group size.
 */
import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  adviserNote,
  caseReferral,
  claim,
  consentGrant,
  finding,
  investigation,
  organization,
  organizationInvitation,
  organizationMembership,
  user,
} from "../db/schema";
import { newId } from "@/lib/ids";
import { AppError, notFound } from "../errors";
import { initials, redactText } from "../security/redact";
import { audit } from "./audit";
import { getInvestigationForUser, logEvent } from "./investigations";
import { notify } from "./notifications";

type OrgRole = "org_admin" | "adviser" | "member";

export async function createOrganization(userId: string, input: { name: string; orgType: (typeof organization.$inferInsert)["orgType"]; isDemo?: boolean }) {
  const id = newId("org");
  const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "org";
  const slug = `${base}-${id.slice(-5)}`;
  await db.insert(organization).values({ id, name: input.name.slice(0, 120), slug, orgType: input.orgType, createdBy: userId, isDemo: input.isDemo ?? false });
  await db.insert(organizationMembership).values({ id: newId("mem"), orgId: id, userId, role: "org_admin" });
  await audit({ actorId: userId, action: "organization.create", resourceType: "organization", resourceId: id, orgId: id });
  return id;
}

export async function myMemberships(userId: string) {
  return db
    .select({ membership: organizationMembership, org: organization })
    .from(organizationMembership)
    .innerJoin(organization, eq(organization.id, organizationMembership.orgId))
    .where(and(eq(organizationMembership.userId, userId), eq(organizationMembership.status, "active")));
}

export async function requireOrgRole(userId: string, orgId: string, roles: OrgRole[]) {
  const [m] = await db
    .select()
    .from(organizationMembership)
    .where(and(eq(organizationMembership.orgId, orgId), eq(organizationMembership.userId, userId), eq(organizationMembership.status, "active")));
  if (!m || !roles.includes(m.role)) {
    await audit({ actorId: userId, action: "organization.access_denied", resourceType: "organization", resourceId: orgId, orgId, outcome: "denied" });
    throw new AppError("FORBIDDEN", "You don't have the required role in this organization.");
  }
  const [org] = await db.select().from(organization).where(eq(organization.id, orgId));
  return { membership: m, org: org! };
}

export async function listMembers(userId: string, orgId: string) {
  await requireOrgRole(userId, orgId, ["org_admin"]);
  const members = await db
    .select({ id: organizationMembership.id, role: organizationMembership.role, status: organizationMembership.status, createdAt: organizationMembership.createdAt, name: user.name, email: user.email, userId: user.id })
    .from(organizationMembership)
    .innerJoin(user, eq(user.id, organizationMembership.userId))
    .where(eq(organizationMembership.orgId, orgId));
  const invites = await db.select().from(organizationInvitation).where(and(eq(organizationInvitation.orgId, orgId), eq(organizationInvitation.status, "pending")));
  return { members, invites };
}

export async function inviteMember(adminId: string, orgId: string, email: string, role: OrgRole) {
  await requireOrgRole(adminId, orgId, ["org_admin"]);
  const token = crypto.randomBytes(24).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await db.insert(organizationInvitation).values({ id: newId("inv8"), orgId, email: email.toLowerCase().trim(), role, tokenHash, invitedBy: adminId, expiresAt: new Date(Date.now() + 14 * 86400_000) });
  await audit({ actorId: adminId, action: "organization.invite", resourceType: "organization", resourceId: orgId, orgId, metadata: { role } });
  return token;
}

export async function acceptInvitation(userId: string, token: string) {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const [inv] = await db.select().from(organizationInvitation).where(eq(organizationInvitation.tokenHash, tokenHash));
  if (!inv || inv.status !== "pending") throw new AppError("NOT_FOUND", "This invitation is invalid or has already been used.");
  if (inv.expiresAt < new Date()) {
    await db.update(organizationInvitation).set({ status: "expired" }).where(eq(organizationInvitation.id, inv.id));
    throw new AppError("CONFLICT", "This invitation has expired.");
  }
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  if (!u || u.email.toLowerCase() !== inv.email) throw new AppError("FORBIDDEN", "This invitation was sent to a different email address.");
  await db
    .insert(organizationMembership)
    .values({ id: newId("mem"), orgId: inv.orgId, userId, role: inv.role })
    .onConflictDoUpdate({ target: [organizationMembership.orgId, organizationMembership.userId], set: { role: inv.role, status: "active" } });
  await db.update(organizationInvitation).set({ status: "accepted" }).where(eq(organizationInvitation.id, inv.id));
  await audit({ actorId: userId, action: "organization.join", resourceType: "organization", resourceId: inv.orgId, orgId: inv.orgId });
  return inv.orgId;
}

export async function revokeInvitation(adminId: string, orgId: string, invitationId: string) {
  await requireOrgRole(adminId, orgId, ["org_admin"]);
  await db.update(organizationInvitation).set({ status: "revoked" }).where(and(eq(organizationInvitation.id, invitationId), eq(organizationInvitation.orgId, orgId)));
}

export async function updateMemberRole(adminId: string, orgId: string, membershipId: string, patch: { role?: OrgRole; status?: "active" | "removed" }) {
  await requireOrgRole(adminId, orgId, ["org_admin"]);
  const [m] = await db.select().from(organizationMembership).where(and(eq(organizationMembership.id, membershipId), eq(organizationMembership.orgId, orgId)));
  if (!m) throw notFound("Member");
  if (m.userId === adminId && (patch.status === "removed" || (patch.role && patch.role !== "org_admin"))) {
    const admins = await db.select().from(organizationMembership).where(and(eq(organizationMembership.orgId, orgId), eq(organizationMembership.role, "org_admin"), eq(organizationMembership.status, "active")));
    if (admins.length <= 1) throw new AppError("CONFLICT", "An organization needs at least one administrator.");
  }
  await db.update(organizationMembership).set(patch).where(eq(organizationMembership.id, membershipId));
  await audit({ actorId: adminId, action: "organization.member_update", resourceType: "organization", resourceId: orgId, orgId, metadata: { role: patch.role ?? null, status: patch.status ?? null } });
}

export async function updateOrganizationSettings(adminId: string, orgId: string, patch: { name?: string; displayName?: string | null; brandColor?: string; contactEmail?: string | null; minAggregateGroupSize?: number }) {
  await requireOrgRole(adminId, orgId, ["org_admin"]);
  if (patch.brandColor && !/^#[0-9a-fA-F]{6}$/.test(patch.brandColor)) throw new AppError("VALIDATION", "Brand colour must be a hex value like #14B8A6.");
  if (patch.minAggregateGroupSize !== undefined && patch.minAggregateGroupSize < 3) throw new AppError("VALIDATION", "Minimum group size must be at least 3.");
  await db.update(organization).set({ ...patch, updatedAt: new Date() }).where(eq(organization.id, orgId));
  await audit({ actorId: adminId, action: "organization.settings_update", resourceType: "organization", resourceId: orgId, orgId });
}

export async function directory() {
  return db.select({ id: organization.id, name: organization.name, displayName: organization.displayName, orgType: organization.orgType, isDemo: organization.isDemo }).from(organization).orderBy(organization.name);
}

// ── Consent ────────────────────────────────────────────────────────────────

export async function grantConsent(userId: string, input: { orgId: string; investigationId: string; scope: "redacted" | "full"; message?: string }) {
  const inv = await getInvestigationForUser(userId, input.investigationId);
  const [org] = await db.select().from(organization).where(eq(organization.id, input.orgId));
  if (!org) throw notFound("Organization");
  const [existing] = await db
    .select()
    .from(consentGrant)
    .where(and(eq(consentGrant.userId, userId), eq(consentGrant.orgId, input.orgId), eq(consentGrant.resourceId, inv.id), eq(consentGrant.status, "active")));
  if (existing) throw new AppError("CONFLICT", "This case is already shared with that organization.");
  const grantId = newId("cg");
  await db.insert(consentGrant).values({ id: grantId, userId, orgId: input.orgId, resourceType: "investigation", resourceId: inv.id, scope: input.scope, message: input.message?.slice(0, 1000) ?? null });
  await db.insert(caseReferral).values({ id: newId("ref"), consentGrantId: grantId, orgId: input.orgId });
  await logEvent(inv.id, "consent_granted", "user", `Shared with ${org.name} (${input.scope === "redacted" ? "redacted" : "full details"}). You can revoke this at any time.`);
  await audit({ actorId: userId, action: "consent.grant", resourceType: "investigation", resourceId: inv.id, orgId: input.orgId, metadata: { scope: input.scope } });
  const staff = await db.select({ userId: organizationMembership.userId }).from(organizationMembership).where(and(eq(organizationMembership.orgId, input.orgId), eq(organizationMembership.status, "active"), inArray(organizationMembership.role, ["adviser", "org_admin"])));
  for (const s of staff) await notify(s.userId, { category: "organization", title: "New case shared with your organization", body: `A renter shared a ${input.scope} case with ${org.name}.`, link: `/organization/cases`, dedupeKey: `ref:${grantId}:${s.userId}` });
  return grantId;
}

export async function revokeConsent(userId: string, grantId: string) {
  const [g] = await db.select().from(consentGrant).where(and(eq(consentGrant.id, grantId), eq(consentGrant.userId, userId)));
  if (!g) throw notFound("Sharing grant");
  if (g.status === "revoked") return;
  await db.update(consentGrant).set({ status: "revoked", revokedAt: new Date() }).where(eq(consentGrant.id, grantId));
  await logEvent(g.resourceId, "consent_revoked", "user", "Sharing revoked. The organization can no longer view this case.");
  await audit({ actorId: userId, action: "consent.revoke", resourceType: "investigation", resourceId: g.resourceId, orgId: g.orgId });
}

export async function listMyConsents(userId: string) {
  return db
    .select({ grant: consentGrant, orgName: organization.name, investigationTitle: investigation.title })
    .from(consentGrant)
    .innerJoin(organization, eq(organization.id, consentGrant.orgId))
    .leftJoin(investigation, eq(investigation.id, consentGrant.resourceId))
    .where(eq(consentGrant.userId, userId))
    .orderBy(desc(consentGrant.grantedAt));
}

// ── Adviser workflow ──────────────────────────────────────────────────────

export async function listReferrals(viewerId: string, orgId: string) {
  await requireOrgRole(viewerId, orgId, ["adviser", "org_admin"]);
  const rows = await db
    .select({ referral: caseReferral, grant: consentGrant, title: investigation.title, city: investigation.city, renterName: user.name })
    .from(caseReferral)
    .innerJoin(consentGrant, eq(consentGrant.id, caseReferral.consentGrantId))
    .leftJoin(investigation, eq(investigation.id, consentGrant.resourceId))
    .leftJoin(user, eq(user.id, consentGrant.userId))
    .where(and(eq(caseReferral.orgId, orgId), eq(consentGrant.status, "active")))
    .orderBy(desc(caseReferral.updatedAt));
  return rows.map((r) => ({
    id: r.referral.id,
    reviewStatus: r.referral.reviewStatus,
    scope: r.grant.scope,
    grantedAt: r.grant.grantedAt,
    message: r.grant.message,
    title: r.grant.scope === "full" ? r.title : "Shared rental case",
    city: r.city,
    renter: r.grant.scope === "full" ? r.renterName : initials(r.renterName),
    updatedAt: r.referral.updatedAt,
  }));
}

/** Returns the shared case view, or throws if consent/role are missing. */
export async function getSharedCase(viewerId: string, orgId: string, referralId: string) {
  await requireOrgRole(viewerId, orgId, ["adviser", "org_admin"]);
  const [r] = await db
    .select({ referral: caseReferral, grant: consentGrant })
    .from(caseReferral)
    .innerJoin(consentGrant, eq(consentGrant.id, caseReferral.consentGrantId))
    .where(and(eq(caseReferral.id, referralId), eq(caseReferral.orgId, orgId)));
  if (!r || r.grant.status !== "active") {
    await audit({ actorId: viewerId, action: "shared_case.access_denied", resourceType: "case_referral", resourceId: referralId, orgId, outcome: "denied" });
    throw new AppError("NOT_FOUND", "This case isn't shared with your organization (or sharing was revoked).");
  }
  const redacted = r.grant.scope === "redacted";
  const [inv] = await db.select().from(investigation).where(eq(investigation.id, r.grant.resourceId));
  const [renter] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, r.grant.userId));
  const findings = await db.select().from(finding).where(and(eq(finding.investigationId, r.grant.resourceId), eq(finding.lifecycle, "active")));
  const claims = await db.select().from(claim).where(eq(claim.investigationId, r.grant.resourceId));
  const notes = await db.select({ note: adviserNote, author: user.name }).from(adviserNote).leftJoin(user, eq(user.id, adviserNote.authorId)).where(eq(adviserNote.referralId, referralId)).orderBy(desc(adviserNote.createdAt));
  const red = (s: string) => (redacted ? redactText(s, { addresses: true }) : s);
  const SHOW = ["rent", "deposit", "requested_payment", "bedrooms", "bathrooms", "lease_term", "payment_method", "application_fee", "utilities", ...(redacted ? [] : ["address", "contact_name", "payment_recipient", "contact_email", "contact_phone"])];
  await audit({ actorId: viewerId, action: "shared_case.view", resourceType: "case_referral", resourceId: referralId, orgId, metadata: { scope: r.grant.scope } });
  return {
    referral: r.referral,
    scope: r.grant.scope,
    message: r.grant.message,
    renter: redacted ? { name: initials(renter?.name), email: null } : renter ?? null,
    case: { title: redacted ? "Shared rental case" : inv?.title ?? "", city: inv?.city ?? null, status: inv?.status ?? "active", summary: inv?.summary ? red(inv.summary) : null },
    findings: findings.map((f) => ({ id: f.id, title: red(f.title), explanation: red(f.explanation), severity: f.severity, label: f.label, category: f.category, citationLabel: f.citationLabel, citationUrl: f.citationUrl })),
    facts: claims.filter((c) => !c.supersededAt && SHOW.includes(c.claimType)).map((c) => ({ type: c.claimType, value: red(c.value), status: c.status })),
    notes: notes.map((n) => ({ ...n.note, author: n.author })),
  };
}

export async function addNote(viewerId: string, orgId: string, referralId: string, body: string, visibleToRenter: boolean) {
  await getSharedCase(viewerId, orgId, referralId);
  await db.insert(adviserNote).values({ id: newId("note"), referralId, authorId: viewerId, body: body.slice(0, 4000), visibleToRenter });
  await db.update(caseReferral).set({ updatedAt: new Date(), reviewStatus: sql`case when ${caseReferral.reviewStatus} = 'new' then 'in_review' else ${caseReferral.reviewStatus} end` }).where(eq(caseReferral.id, referralId));
}

export async function setReferralStatus(viewerId: string, orgId: string, referralId: string, status: "new" | "in_review" | "awaiting_renter" | "closed", closureNote?: string) {
  await getSharedCase(viewerId, orgId, referralId);
  await db
    .update(caseReferral)
    .set({ reviewStatus: status, assignedAdviserId: viewerId, updatedAt: new Date(), ...(status === "closed" ? { closedAt: new Date(), closureNote: closureNote?.slice(0, 1000) ?? null } : {}) })
    .where(eq(caseReferral.id, referralId));
  await audit({ actorId: viewerId, action: "referral.status", resourceType: "case_referral", resourceId: referralId, orgId, metadata: { status } });
}

export async function notesForRenter(userId: string, investigationId: string) {
  await getInvestigationForUser(userId, investigationId);
  return db
    .select({ body: adviserNote.body, createdAt: adviserNote.createdAt, orgName: organization.name })
    .from(adviserNote)
    .innerJoin(caseReferral, eq(caseReferral.id, adviserNote.referralId))
    .innerJoin(consentGrant, eq(consentGrant.id, caseReferral.consentGrantId))
    .innerJoin(organization, eq(organization.id, caseReferral.orgId))
    .where(and(eq(consentGrant.resourceId, investigationId), eq(consentGrant.userId, userId), eq(adviserNote.visibleToRenter, true)))
    .orderBy(desc(adviserNote.createdAt));
}

// ── Aggregates with disclosure control ─────────────────────────────────────

export function suppress(count: number, min: number): number | `<${number}` {
  return count < min ? `<${min}` : count;
}

export async function organizationAggregates(viewerId: string, orgId: string) {
  const { org } = await requireOrgRole(viewerId, orgId, ["org_admin", "adviser"]);
  const min = org.minAggregateGroupSize;
  const grants = await db.select().from(consentGrant).where(eq(consentGrant.orgId, orgId));
  const activeIds = grants.filter((g) => g.status === "active").map((g) => g.resourceId);
  const referrals = await db.select().from(caseReferral).where(eq(caseReferral.orgId, orgId));
  const fRows = activeIds.length ? await db.select({ category: finding.category, key: finding.findingKey, inv: finding.investigationId }).from(finding).where(and(inArray(finding.investigationId, activeIds), eq(finding.lifecycle, "active"))) : [];
  const casesWith = (pred: (k: string, c: string) => boolean) => new Set(fRows.filter((f) => pred(f.key, f.category)).map((f) => f.inv)).size;
  const byStatus = (["new", "in_review", "awaiting_renter", "closed"] as const).map((s) => ({ status: s, count: suppress(referrals.filter((r) => r.reviewStatus === s).length, min) }));
  const themes = [
    { theme: "Deposit above legal limit", count: suppress(casesWith((k) => k === "legal:NS-DEPOSIT-MAX"), min) },
    { theme: "Application fee requested", count: suppress(casesWith((k) => k === "legal:NS-APPLICATION-FEE"), min) },
    { theme: "Payment pressure", count: suppress(casesWith((k) => k === "warning:payment_pressure"), min) },
    { theme: "Viewing refused before payment", count: suppress(casesWith((k) => k === "warning:viewing_refused"), min) },
    { theme: "Lease differs from listing", count: suppress(casesWith((k) => k === "contradiction:rent"), min) },
    { theme: "Recipient differs from advertiser", count: suppress(casesWith((k) => k === "warning:payment_recipient_differs"), min) },
  ];
  const months = new Map<string, number>();
  for (const g of grants) {
    const m = g.grantedAt.toISOString().slice(0, 7);
    months.set(m, (months.get(m) ?? 0) + 1);
  }
  return {
    org,
    minGroupSize: min,
    totalShared: suppress(grants.length, min),
    activeShared: suppress(activeIds.length, min),
    revoked: suppress(grants.filter((g) => g.status === "revoked").length, min),
    byStatus,
    themes,
    byMonth: [...months.entries()].sort().map(([month, n]) => ({ month, count: suppress(n, min) })),
    belowThreshold: grants.length < min,
  };
}
