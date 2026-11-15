"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { action } from "./helpers";
import { requireApiUser } from "../auth/session";
import { AppError, toActionError, type ActionResult } from "../errors";
import { validateUpload } from "../security/upload";
import { parseMoneyToCents } from "@/lib/money";
import { ROOMS } from "../db/schema";
import * as T from "../services/tenancy";
import * as L from "../services/leases";
import * as D from "../services/disputes";
import { createDraft } from "../services/communications";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
const optDate = date.optional().or(z.literal(""));
const money = (v?: string) => (v ? parseMoneyToCents(v) : null);
const file = async (fd: FormData, key = "file") => {
  const f = fd.get(key);
  return f instanceof File && f.size > 0 ? validateUpload(f) : null;
};

// ── Leases ──
export async function createLeaseReviewAction(fd: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const u = await requireApiUser();
    const title = String(fd.get("title") ?? "").trim() || "Lease review";
    const investigationId = String(fd.get("investigationId") ?? "") || null;
    const text = String(fd.get("text") ?? "");
    const id = await L.createLeaseReview(u.id, { title, investigationId, text, file: await file(fd) });
    revalidatePath("/lease-review");
    return { ok: true, data: { id } };
  } catch (e) {
    return toActionError(e);
  }
}
export async function addLeaseVersionAction(fd: FormData): Promise<ActionResult<null>> {
  try {
    const u = await requireApiUser();
    const leaseId = String(fd.get("leaseId"));
    await L.addLeaseVersion(u.id, leaseId, { text: String(fd.get("text") ?? ""), file: await file(fd) });
    revalidatePath(`/lease-review/${leaseId}`);
    return { ok: true, data: null };
  } catch (e) {
    return toActionError(e);
  }
}
export async function deleteLeaseAction(id: string) {
  const u = await requireApiUser();
  await L.deleteLeaseReview(u.id, id);
  revalidatePath("/lease-review");
  redirect("/lease-review");
}

// ── Tenancy & inspections ──
export const createTenancyAction = action(
  z.object({ label: z.string().min(1).max(120), address: z.string().max(200).optional(), landlordName: z.string().max(120).optional(), landlordContact: z.string().max(200).optional(), leaseType: z.enum(["year_to_year", "month_to_month", "week_to_week", "fixed_term", "unknown"]), startDate: optDate, endDate: optDate, moveInDate: optDate, rent: z.string().max(12).optional(), status: z.enum(["upcoming", "active", "ended"]), investigationId: z.string().optional() }),
  async (u, v) => {
    const id = await T.createTenancy(u.id, { ...v, startDate: v.startDate || null, endDate: v.endDate || null, moveInDate: v.moveInDate || null, monthlyRentCents: money(v.rent), investigationId: v.investigationId || null });
    const insp = await T.createInspection(u.id, id, "move_in", v.moveInDate || v.startDate || null);
    revalidatePath("/move-in");
    return { tenancyId: id, inspectionId: insp };
  },
);
export const createInspectionAction = action(z.object({ tenancyId: z.string(), kind: z.enum(["move_in", "move_out"]), inspectedOn: optDate }), async (u, v) => {
  const id = await T.createInspection(u.id, v.tenancyId, v.kind, v.inspectedOn || null);
  revalidatePath("/move-in");
  return { id };
});
export const updateInspectionAction = action(z.object({ inspectionId: z.string(), inspectedOn: optDate, landlordPresent: z.boolean().optional(), witnessName: z.string().max(120).optional(), notes: z.string().max(3000).optional(), status: z.enum(["draft", "completed"]).optional(), officialFormCompleted: z.boolean().optional() }), async (u, v) => {
  await T.updateInspection(u.id, v.inspectionId, { ...v, inspectedOn: v.inspectedOn || null });
  revalidatePath(`/move-in/${v.inspectionId}`);
  return null;
});
const itemSchema = z.object({ room: z.enum(ROOMS), roomLabel: z.string().max(60).optional(), itemName: z.string().min(1, "Name the item.").max(80), condition: z.enum(["good", "fair", "poor", "damaged", "missing", "not_working", "not_applicable"]), description: z.string().max(2000).optional(), preExisting: z.boolean().optional(), repairPromised: z.boolean().optional(), repairDueDate: optDate });
export async function addInspectionItemAction(fd: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const u = await requireApiUser();
    const inspectionId = String(fd.get("inspectionId"));
    const v = itemSchema.parse({ room: fd.get("room"), roomLabel: fd.get("roomLabel") || undefined, itemName: fd.get("itemName"), condition: fd.get("condition"), description: fd.get("description") || undefined, preExisting: fd.get("preExisting") === "on", repairPromised: fd.get("repairPromised") === "on", repairDueDate: fd.get("repairDueDate") || undefined });
    const id = await T.addInspectionItem(u.id, inspectionId, { ...v, repairDueDate: v.repairDueDate || null });
    const photos = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 6);
    for (const p of photos) await T.addInspectionPhoto(u.id, id, await validateUpload(p, ["png", "jpeg", "webp"]), String(fd.get("caption") ?? "") || undefined);
    revalidatePath(`/move-in/${inspectionId}`);
    return { ok: true, data: { id } };
  } catch (e) {
    if (e instanceof z.ZodError) return toActionError(new AppError("VALIDATION", e.issues[0]?.message ?? "Check the form."));
    return toActionError(e);
  }
}
export const deleteInspectionItemAction = action(z.object({ itemId: z.string(), inspectionId: z.string() }), async (u, v) => {
  await T.deleteInspectionItem(u.id, v.itemId);
  revalidatePath(`/move-in/${v.inspectionId}`);
  return null;
});
export const itemToMaintenanceAction = action(z.object({ itemId: z.string(), tenancyId: z.string(), title: z.string().max(140), description: z.string().max(2000), room: z.string().max(40) }), async (u, v) => {
  const id = await T.createMaintenanceCase(u.id, { title: v.title, description: v.description, tenancyId: v.tenancyId, location: v.room, inspectionItemId: v.itemId, discoveredOn: new Date().toISOString().slice(0, 10) });
  revalidatePath("/maintenance");
  return { id };
});

// ── Maintenance ──
export const createMaintenanceAction = action(z.object({ title: z.string().min(1).max(140), description: z.string().min(1).max(4000), tenancyId: z.string().optional(), location: z.string().max(60).optional(), severity: z.enum(["low", "medium", "urgent"]), discoveredOn: optDate }), async (u, v) => {
  const id = await T.createMaintenanceCase(u.id, { ...v, tenancyId: v.tenancyId || null, discoveredOn: v.discoveredOn || null });
  revalidatePath("/maintenance");
  return { id };
});
const mEvent = z.object({ eventType: z.enum(["reported", "landlord_response", "repair_promised", "landlord_reports_complete", "tenant_confirmed_resolved", "tenant_reports_unresolved", "follow_up_sent", "photo_added", "note"]), occurredOn: date, description: z.string().min(1, "Describe what happened.").max(2000), promisedDate: optDate });
export async function addMaintenanceEventAction(fd: FormData): Promise<ActionResult<null>> {
  try {
    const u = await requireApiUser();
    const caseId = String(fd.get("caseId"));
    const v = mEvent.parse({ eventType: fd.get("eventType"), occurredOn: fd.get("occurredOn"), description: fd.get("description"), promisedDate: fd.get("promisedDate") || undefined });
    await T.addMaintenanceEvent(u.id, caseId, { ...v, promisedDate: v.promisedDate || null, file: await file(fd) });
    revalidatePath(`/maintenance/${caseId}`);
    return { ok: true, data: null };
  } catch (e) {
    if (e instanceof z.ZodError) return toActionError(new AppError("VALIDATION", e.issues[0]?.message ?? "Check the form."));
    return toActionError(e);
  }
}
export const maintenanceFollowUpAction = action(z.object({ caseId: z.string() }), async (u, v) => {
  const { case: c } = await T.getMaintenanceCase(u.id, v.caseId);
  const d = await createDraft(u.id, { purpose: "repair_followup", maintenanceCaseId: c.id, context: { repair: { title: c.title, reportedOn: c.reportedOn, promisedBy: c.promisedBy }, senderName: u.name } });
  revalidatePath(`/maintenance/${c.id}`);
  return d;
});

// ── Deposits ──
export const createDepositAction = action(z.object({ amount: z.string().min(1, "Enter the amount."), rent: z.string().optional(), tenancyId: z.string().optional(), paidOn: optDate, paidTo: z.string().max(120).optional(), paymentMethod: z.string().max(60).optional() }), async (u, v) => {
  const amountCents = money(v.amount);
  if (!amountCents) throw new AppError("VALIDATION", "Enter a valid amount.");
  const id = await T.createDeposit(u.id, { amountCents, monthlyRentCents: money(v.rent), tenancyId: v.tenancyId || null, paidOn: v.paidOn || null, paidTo: v.paidTo || null, paymentMethod: v.paymentMethod || null });
  revalidatePath("/deposit-protection");
  return { id };
});
const dEvent = z.object({ eventType: z.enum(["paid", "receipt_uploaded", "tenancy_ended", "return_requested", "amount_returned", "deduction_claimed", "deduction_disputed", "landlord_claim_received", "tenant_application_filed", "note"]), occurredOn: date, amount: z.string().optional(), description: z.string().min(1, "Describe the event.").max(2000) });
export async function addDepositEventAction(fd: FormData): Promise<ActionResult<null>> {
  try {
    const u = await requireApiUser();
    const depositId = String(fd.get("depositId"));
    const v = dEvent.parse({ eventType: fd.get("eventType"), occurredOn: fd.get("occurredOn"), amount: fd.get("amount") || undefined, description: fd.get("description") });
    await T.addDepositEvent(u.id, depositId, { eventType: v.eventType, occurredOn: v.occurredOn, amountCents: money(v.amount), description: v.description, file: await file(fd) });
    revalidatePath("/deposit-protection");
    return { ok: true, data: null };
  } catch (e) {
    if (e instanceof z.ZodError) return toActionError(new AppError("VALIDATION", e.issues[0]?.message ?? "Check the form."));
    return toActionError(e);
  }
}
export const depositReturnDraftAction = action(z.object({ depositId: z.string() }), async (u, v) => {
  const { deposit, events } = await T.getDeposit(u.id, v.depositId);
  const s = T.depositStatusSummary(deposit, events);
  const { formatCents } = await import("@/lib/money");
  return createDraft(u.id, { purpose: "deposit_return", context: { deposit: { amount: formatCents(deposit.amountCents), tenancyEndedOn: deposit.tenancyEndedOn, deadline: s.deadline }, senderName: u.name } });
});

// ── Disputes ──
export const createDisputeAction = action(z.object({ disputeType: z.enum(["deposit", "maintenance", "unexpected_fee", "lease_discrepancy", "rent_increase", "misrepresentation"]), title: z.string().min(1).max(140), investigationId: z.string().optional(), tenancyId: z.string().optional(), maintenanceCaseId: z.string().optional(), depositId: z.string().optional() }), async (u, v) => {
  const id = await D.createDispute(u.id, { ...v, investigationId: v.investigationId || null, tenancyId: v.tenancyId || null, maintenanceCaseId: v.maintenanceCaseId || null, depositId: v.depositId || null });
  revalidatePath("/disputes");
  return { id };
});
export const updateDisputeAction = action(z.object({ id: z.string(), summary: z.string().max(6000).optional(), status: z.enum(["drafting", "ready_for_review", "archived"]).optional(), excludeItemId: z.string().optional(), includeItemId: z.string().optional() }), async (u, v) => {
  await D.updateDispute(u.id, v.id, v);
  revalidatePath("/disputes");
  return null;
});
export const rebuildDisputeAction = action(z.object({ id: z.string() }), async (u, v) => {
  await D.buildPackage(u.id, v.id);
  revalidatePath("/disputes");
  return null;
});
export const deleteDisputeAction = action(z.object({ id: z.string() }), async (u, v) => {
  await D.deleteDispute(u.id, v.id);
  revalidatePath("/disputes");
  return null;
});
