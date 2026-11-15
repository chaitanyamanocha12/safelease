"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "./helpers";
import * as O from "../services/organizations";
import { env } from "../env";
import { getEmailProvider } from "../providers/email";

const rv = () => revalidatePath("/organization", "layout");

export const createOrgAction = action(z.object({ name: z.string().min(2).max(120), orgType: z.enum(["university", "student_union", "settlement", "housing_nonprofit", "tenant_support", "other"]) }), async (u, v) => {
  const id = await O.createOrganization(u.id, v);
  rv();
  return { id };
});
export const inviteAction = action(z.object({ orgId: z.string(), email: z.string().email(), role: z.enum(["org_admin", "adviser", "member"]) }), async (u, v) => {
  const token = await O.inviteMember(u.id, v.orgId, v.email, v.role);
  const link = `${env().APP_URL}/organization?invite=${token}`;
  const sent = await getEmailProvider().send({ to: v.email, subject: "You've been invited to a SafeLease organization", text: `You've been invited to join an organization on SafeLease as ${v.role.replace("_", " ")}.\n\nAccept: ${link}\n\nThis link expires in 14 days.` });
  rv();
  return { link, emailOutcome: sent.outcome };
});
export const acceptInviteAction = action(z.object({ token: z.string().min(10) }), async (u, v) => {
  const orgId = await O.acceptInvitation(u.id, v.token);
  rv();
  return { orgId };
});
export const revokeInviteAction = action(z.object({ orgId: z.string(), invitationId: z.string() }), async (u, v) => {
  await O.revokeInvitation(u.id, v.orgId, v.invitationId);
  rv();
  return null;
});
export const memberUpdateAction = action(z.object({ orgId: z.string(), membershipId: z.string(), role: z.enum(["org_admin", "adviser", "member"]).optional(), status: z.enum(["active", "removed"]).optional() }), async (u, v) => {
  await O.updateMemberRole(u.id, v.orgId, v.membershipId, { role: v.role, status: v.status });
  rv();
  return null;
});
export const orgSettingsAction = action(z.object({ orgId: z.string(), name: z.string().min(2).max(120), displayName: z.string().max(120).optional(), brandColor: z.string().max(7), contactEmail: z.string().email().optional().or(z.literal("")), minAggregateGroupSize: z.coerce.number().int().min(3).max(50) }), async (u, v) => {
  await O.updateOrganizationSettings(u.id, v.orgId, { name: v.name, displayName: v.displayName || null, brandColor: v.brandColor, contactEmail: v.contactEmail || null, minAggregateGroupSize: v.minAggregateGroupSize });
  rv();
  return null;
});
export const addNoteAction = action(z.object({ orgId: z.string(), referralId: z.string(), body: z.string().min(1).max(4000), visibleToRenter: z.boolean() }), async (u, v) => {
  await O.addNote(u.id, v.orgId, v.referralId, v.body, v.visibleToRenter);
  rv();
  return null;
});
export const referralStatusAction = action(z.object({ orgId: z.string(), referralId: z.string(), status: z.enum(["new", "in_review", "awaiting_renter", "closed"]), closureNote: z.string().max(1000).optional() }), async (u, v) => {
  await O.setReferralStatus(u.id, v.orgId, v.referralId, v.status, v.closureNote);
  rv();
  return null;
});
