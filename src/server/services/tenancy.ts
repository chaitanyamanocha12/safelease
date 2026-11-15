/**
 * Tenancy records, move-in/move-out inspections, maintenance cases and
 * security-deposit tracking. All queries are scoped to the owner.
 * AI never invents damage or completion; it only organizes recorded evidence.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  depositEvent,
  depositRecord,
  document,
  inspection,
  inspectionImage,
  inspectionItem,
  maintenanceCase,
  maintenanceEvent,
  tenancy,
  type Room,
} from "../db/schema";
import { newId } from "@/lib/ids";
import { AppError, notFound } from "../errors";
import { formatCents } from "@/lib/money";
import { checkDepositReturn, depositReturnDeadline } from "../legal/rules";
import { catalogRuleLookup } from "../legal/engine";
import type { ValidatedUpload } from "../security/upload";
import { storeDocument } from "./documents";
import { audit } from "./audit";

// ── Tenancies ──────────────────────────────────────────────────────────────

export async function createTenancy(ownerId: string, input: Partial<typeof tenancy.$inferInsert> & { label: string }) {
  const id = newId("ten");
  await db.insert(tenancy).values({
    id,
    ownerId,
    label: input.label.slice(0, 120),
    address: input.address ?? null,
    landlordName: input.landlordName ?? null,
    landlordContact: input.landlordContact ?? null,
    leaseType: input.leaseType ?? "unknown",
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    moveInDate: input.moveInDate ?? null,
    monthlyRentCents: input.monthlyRentCents ?? null,
    status: input.status ?? "upcoming",
    investigationId: input.investigationId ?? null,
    isDemo: input.isDemo ?? false,
  });
  await audit({ actorId: ownerId, action: "tenancy.create", resourceType: "tenancy", resourceId: id });
  return id;
}

export async function listTenancies(ownerId: string) {
  return db.select().from(tenancy).where(eq(tenancy.ownerId, ownerId)).orderBy(desc(tenancy.updatedAt));
}

export async function getTenancy(ownerId: string, id: string) {
  const [t] = await db.select().from(tenancy).where(and(eq(tenancy.id, id), eq(tenancy.ownerId, ownerId)));
  if (!t) throw notFound("Tenancy");
  return t;
}

export async function updateTenancy(ownerId: string, id: string, patch: Partial<typeof tenancy.$inferInsert>) {
  await getTenancy(ownerId, id);
  const { ownerId: _o, id: _i, ...safe } = patch;
  void _o;
  void _i;
  await db.update(tenancy).set({ ...safe, updatedAt: new Date() }).where(eq(tenancy.id, id));
}

// ── Inspections ────────────────────────────────────────────────────────────

export async function createInspection(ownerId: string, tenancyId: string, kind: "move_in" | "move_out", inspectedOn?: string | null) {
  await getTenancy(ownerId, tenancyId);
  const id = newId("insp");
  await db.insert(inspection).values({ id, tenancyId, kind, inspectedOn: inspectedOn ?? null });
  return id;
}

export async function getInspection(ownerId: string, inspectionId: string) {
  const [row] = await db.select({ i: inspection, t: tenancy }).from(inspection).innerJoin(tenancy, eq(tenancy.id, inspection.tenancyId)).where(and(eq(inspection.id, inspectionId), eq(tenancy.ownerId, ownerId)));
  if (!row) throw notFound("Inspection");
  const items = await db.select().from(inspectionItem).where(eq(inspectionItem.inspectionId, inspectionId)).orderBy(asc(inspectionItem.room), asc(inspectionItem.createdAt));
  const images = items.length
    ? await db
        .select({ img: inspectionImage, doc: document })
        .from(inspectionImage)
        .innerJoin(document, eq(document.id, inspectionImage.documentId))
        .where(inArray(inspectionImage.inspectionItemId, items.map((x) => x.id)))
    : [];
  return { inspection: row.i, tenancy: row.t, items, images };
}

export async function updateInspection(ownerId: string, inspectionId: string, patch: { inspectedOn?: string | null; landlordPresent?: boolean | null; witnessName?: string | null; notes?: string | null; status?: "draft" | "completed"; officialFormCompleted?: boolean }) {
  await getInspection(ownerId, inspectionId);
  await db.update(inspection).set({ ...patch, updatedAt: new Date() }).where(eq(inspection.id, inspectionId));
}

export async function addInspectionItem(ownerId: string, inspectionId: string, item: { room: Room; roomLabel?: string | null; itemName: string; condition: (typeof inspectionItem.$inferInsert)["condition"]; description?: string | null; preExisting?: boolean; repairPromised?: boolean; repairDueDate?: string | null }) {
  await getInspection(ownerId, inspectionId);
  const id = newId("item");
  await db.insert(inspectionItem).values({ id, inspectionId, ...item, roomLabel: item.roomLabel ?? null, description: item.description?.slice(0, 2000) ?? null });
  return id;
}

export async function updateInspectionItem(ownerId: string, itemId: string, patch: Partial<typeof inspectionItem.$inferInsert>) {
  const [it] = await db.select().from(inspectionItem).where(eq(inspectionItem.id, itemId));
  if (!it) throw notFound("Item");
  await getInspection(ownerId, it.inspectionId);
  const { id: _i, inspectionId: _x, ...safe } = patch;
  void _i;
  void _x;
  await db.update(inspectionItem).set({ ...safe, updatedAt: new Date() }).where(eq(inspectionItem.id, itemId));
}

export async function deleteInspectionItem(ownerId: string, itemId: string) {
  const [it] = await db.select().from(inspectionItem).where(eq(inspectionItem.id, itemId));
  if (!it) throw notFound("Item");
  await getInspection(ownerId, it.inspectionId);
  await db.delete(inspectionItem).where(eq(inspectionItem.id, itemId));
}

export async function addInspectionPhoto(ownerId: string, itemId: string, upload: ValidatedUpload, caption?: string) {
  const [it] = await db.select().from(inspectionItem).where(eq(inspectionItem.id, itemId));
  if (!it) throw notFound("Item");
  const { tenancy: t } = await getInspection(ownerId, it.inspectionId);
  const stored = await storeDocument({ ownerId, upload, title: caption || `${it.itemName} (${it.room})`, docType: "photo", links: { tenancyId: t.id }, extract: false, tags: ["inspection"] });
  await db.insert(inspectionImage).values({ id: newId("iimg"), inspectionItemId: itemId, documentId: stored.documentId, caption: caption?.slice(0, 200) ?? null });
  return stored;
}

/** Move-in vs move-out comparison by room + item name (pure over loaded data). */
export function compareInspections(
  moveIn: Array<typeof inspectionItem.$inferSelect>,
  moveOut: Array<typeof inspectionItem.$inferSelect>,
): Array<{ room: string; itemName: string; moveIn: string | null; moveOut: string | null; change: "unchanged" | "worse" | "better" | "new_at_move_out" | "not_recorded_at_move_out"; preExisting: boolean }> {
  const rank = { good: 0, fair: 1, poor: 2, damaged: 3, not_working: 3, missing: 4, not_applicable: -1 } as const;
  const key = (i: { room: string; itemName: string; roomLabel?: string | null }) => `${i.room}|${(i.roomLabel ?? "").toLowerCase()}|${i.itemName.toLowerCase().trim()}`;
  const outMap = new Map(moveOut.map((i) => [key(i), i]));
  const rows: ReturnType<typeof compareInspections> = [];
  for (const a of moveIn) {
    const b = outMap.get(key(a));
    outMap.delete(key(a));
    if (!b) {
      rows.push({ room: a.room, itemName: a.itemName, moveIn: a.condition, moveOut: null, change: "not_recorded_at_move_out", preExisting: a.preExisting });
      continue;
    }
    const d = rank[b.condition] - rank[a.condition];
    rows.push({ room: a.room, itemName: a.itemName, moveIn: a.condition, moveOut: b.condition, change: d > 0 ? "worse" : d < 0 ? "better" : "unchanged", preExisting: a.preExisting });
  }
  for (const b of outMap.values()) rows.push({ room: b.room, itemName: b.itemName, moveIn: null, moveOut: b.condition, change: "new_at_move_out", preExisting: false });
  return rows;
}

// ── Maintenance ────────────────────────────────────────────────────────────

export async function createMaintenanceCase(ownerId: string, input: { title: string; description: string; tenancyId?: string | null; location?: string | null; severity?: "low" | "medium" | "urgent"; discoveredOn?: string | null; inspectionItemId?: string | null; isDemo?: boolean }) {
  if (input.tenancyId) await getTenancy(ownerId, input.tenancyId);
  const id = newId("mnt");
  await db.insert(maintenanceCase).values({ id, ownerId, title: input.title.slice(0, 140), description: input.description.slice(0, 4000), tenancyId: input.tenancyId ?? null, location: input.location ?? null, severity: input.severity ?? "medium", discoveredOn: input.discoveredOn ?? null, inspectionItemId: input.inspectionItemId ?? null, isDemo: input.isDemo ?? false });
  await db.insert(maintenanceEvent).values({ id: newId("me"), caseId: id, eventType: "discovered", occurredOn: input.discoveredOn ?? new Date().toISOString().slice(0, 10), description: `Issue recorded: ${input.title.slice(0, 120)}` });
  return id;
}

export async function getMaintenanceCase(ownerId: string, id: string) {
  const [c] = await db.select().from(maintenanceCase).where(and(eq(maintenanceCase.id, id), eq(maintenanceCase.ownerId, ownerId)));
  if (!c) throw notFound("Maintenance case");
  const events = await db.select().from(maintenanceEvent).where(eq(maintenanceEvent.caseId, id)).orderBy(asc(maintenanceEvent.occurredOn), asc(maintenanceEvent.createdAt));
  return { case: c, events };
}

export async function listMaintenance(ownerId: string) {
  return db.select().from(maintenanceCase).where(eq(maintenanceCase.ownerId, ownerId)).orderBy(desc(maintenanceCase.updatedAt));
}

const STATUS_FROM_EVENT: Partial<Record<(typeof maintenanceEvent.$inferInsert)["eventType"], (typeof maintenanceCase.$inferInsert)["status"]>> = {
  reported: "reported",
  repair_promised: "repair_promised",
  landlord_reports_complete: "landlord_reports_complete",
  tenant_confirmed_resolved: "tenant_confirmed_resolved",
  tenant_reports_unresolved: "reported",
};

export async function addMaintenanceEvent(ownerId: string, caseId: string, ev: { eventType: (typeof maintenanceEvent.$inferInsert)["eventType"]; occurredOn: string; description: string; promisedDate?: string | null; file?: ValidatedUpload | null }) {
  const { case: c } = await getMaintenanceCase(ownerId, caseId);
  let documentId: string | null = null;
  if (ev.file) {
    const stored = await storeDocument({ ownerId, upload: ev.file, title: `${c.title} — ${ev.eventType.replace(/_/g, " ")}`, docType: "repair", links: { maintenanceCaseId: caseId, tenancyId: c.tenancyId }, extract: false });
    documentId = stored.documentId;
  }
  await db.insert(maintenanceEvent).values({ id: newId("me"), caseId, eventType: ev.eventType, occurredOn: ev.occurredOn, description: ev.description.slice(0, 2000), promisedDate: ev.promisedDate ?? null, documentId });
  const status = STATUS_FROM_EVENT[ev.eventType];
  await db
    .update(maintenanceCase)
    .set({
      ...(status ? { status } : {}),
      ...(ev.eventType === "reported" && !c.reportedOn ? { reportedOn: ev.occurredOn } : {}),
      ...(ev.eventType === "repair_promised" && ev.promisedDate ? { promisedBy: ev.promisedDate } : {}),
      ...(ev.eventType === "tenant_confirmed_resolved" ? { confirmedResolvedOn: ev.occurredOn } : {}),
      updatedAt: new Date(),
    })
    .where(eq(maintenanceCase.id, caseId));
}

export interface MaintenanceAnalysis {
  chronology: Array<{ date: string; label: string }>;
  missing: string[];
  conflicts: string[];
  flags: Array<{ tone: "warn" | "info" | "bad"; text: string }>;
  nextStep: string;
}

/** Deterministic maintenance analysis (organizes evidence; never accuses). */
export function analyzeMaintenance(c: typeof maintenanceCase.$inferSelect, events: Array<typeof maintenanceEvent.$inferSelect>, today = new Date().toISOString().slice(0, 10)): MaintenanceAnalysis {
  const chronology = events.map((e) => ({ date: e.occurredOn, label: `${e.eventType.replace(/_/g, " ")}: ${e.description}` }));
  const missing: string[] = [];
  if (!events.some((e) => e.eventType === "reported")) missing.push("No record that the issue was reported to the landlord in writing.");
  if (!events.some((e) => e.documentId)) missing.push("No photos or documents attached yet.");
  if (!c.location) missing.push("Location in the unit isn't recorded.");
  const promises = events.filter((e) => e.eventType === "repair_promised" && e.promisedDate);
  const conflicts: string[] = [];
  const dates = [...new Set(promises.map((p) => p.promisedDate!))];
  if (dates.length > 1) conflicts.push(`Different repair dates were promised: ${dates.join(", ")}.`);
  const flags: MaintenanceAnalysis["flags"] = [];
  const latestPromise = promises.at(-1)?.promisedDate;
  const resolved = c.status === "tenant_confirmed_resolved";
  if (latestPromise && latestPromise < today && !resolved && !events.some((e) => e.eventType === "landlord_reports_complete" && e.occurredOn >= latestPromise)) {
    flags.push({ tone: "warn", text: `The promised repair date (${latestPromise}) has passed without a recorded completion.` });
  }
  if (c.status === "landlord_reports_complete") {
    flags.push({ tone: "info", text: "The landlord reports the repair is complete. A landlord's statement alone doesn't confirm completion — check it and record the result." });
  }
  const reported = events.find((e) => e.eventType === "reported");
  if (reported && !events.some((e) => e.eventType === "landlord_response" || e.eventType === "repair_promised") && !resolved) {
    const days = Math.round((new Date(today).getTime() - new Date(reported.occurredOn).getTime()) / 86400000);
    if (days >= 7) flags.push({ tone: "warn", text: `No landlord response recorded ${days} days after the report.` });
  }
  if (c.severity === "urgent" && !resolved) flags.push({ tone: "bad", text: "Marked urgent. For no heat or safety hazards, the Residential Tenancies Program offers an emergency hearing process (Form DR9)." });
  const nextStep = resolved
    ? "Issue confirmed resolved. Keep the record for your move-out and deposit."
    : c.status === "landlord_reports_complete"
      ? "Verify the repair and record whether it's resolved."
      : !reported
        ? "Report the issue to your landlord in writing and record it here."
        : flags.some((f) => f.tone === "warn")
          ? "Send a polite written follow-up and keep dated photos."
          : "Keep recording responses and photos as they happen.";
  return { chronology, missing, conflicts, flags, nextStep };
}

// ── Deposits ───────────────────────────────────────────────────────────────

export async function createDeposit(ownerId: string, input: { amountCents: number; tenancyId?: string | null; monthlyRentCents?: number | null; paidOn?: string | null; paidTo?: string | null; paymentMethod?: string | null; isDemo?: boolean }) {
  if (input.tenancyId) await getTenancy(ownerId, input.tenancyId);
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new AppError("VALIDATION", "Enter the deposit amount.");
  const id = newId("dep");
  await db.insert(depositRecord).values({ id, ownerId, ...input, tenancyId: input.tenancyId ?? null });
  if (input.paidOn) await db.insert(depositEvent).values({ id: newId("de"), depositId: id, eventType: "paid", occurredOn: input.paidOn, amountCents: input.amountCents, description: `Deposit of ${formatCents(input.amountCents)} paid${input.paidTo ? ` to ${input.paidTo}` : ""}.` });
  return id;
}

export async function listDeposits(ownerId: string) {
  return db.select().from(depositRecord).where(eq(depositRecord.ownerId, ownerId)).orderBy(desc(depositRecord.updatedAt));
}

export async function getDeposit(ownerId: string, id: string) {
  const [d] = await db.select().from(depositRecord).where(and(eq(depositRecord.id, id), eq(depositRecord.ownerId, ownerId)));
  if (!d) throw notFound("Deposit record");
  const events = await db.select().from(depositEvent).where(eq(depositEvent.depositId, id)).orderBy(asc(depositEvent.occurredOn), asc(depositEvent.createdAt));
  return { deposit: d, events };
}

export async function addDepositEvent(ownerId: string, depositId: string, ev: { eventType: (typeof depositEvent.$inferInsert)["eventType"]; occurredOn: string; amountCents?: number | null; description: string; file?: ValidatedUpload | null }) {
  const { deposit: d } = await getDeposit(ownerId, depositId);
  let documentId: string | null = null;
  if (ev.file) documentId = (await storeDocument({ ownerId, upload: ev.file, title: `Deposit — ${ev.eventType.replace(/_/g, " ")}`, docType: ev.eventType === "receipt_uploaded" ? "deposit_receipt" : "correspondence", links: { depositId, tenancyId: d.tenancyId }, extract: true })).documentId;
  await db.insert(depositEvent).values({ id: newId("de"), depositId, eventType: ev.eventType, occurredOn: ev.occurredOn, amountCents: ev.amountCents ?? null, description: ev.description.slice(0, 2000), documentId });
  const patch: Partial<typeof depositRecord.$inferInsert> = { updatedAt: new Date() };
  if (ev.eventType === "tenancy_ended") Object.assign(patch, { tenancyEndedOn: ev.occurredOn, status: "tenancy_ended" });
  if (ev.eventType === "return_requested" && ev.amountCents) patch.amountRequestedBackCents = ev.amountCents;
  if (ev.eventType === "amount_returned" && ev.amountCents) {
    const total = (d.amountReturnedCents ?? 0) + ev.amountCents;
    Object.assign(patch, { amountReturnedCents: total, status: total >= d.amountCents ? "fully_returned" : "partially_returned" });
  }
  if (ev.eventType === "landlord_claim_received") patch.status = "landlord_claim_filed";
  if (ev.eventType === "deduction_disputed" || ev.eventType === "tenant_application_filed") patch.status = "disputed";
  await db.update(depositRecord).set(patch).where(eq(depositRecord.id, depositId));
}

export function depositStatusSummary(d: typeof depositRecord.$inferSelect, events: Array<typeof depositEvent.$inferSelect>, today = new Date().toISOString().slice(0, 10)) {
  const rule = catalogRuleLookup()("NS-DEPOSIT-RETURN")!;
  const res = checkDepositReturn(rule, {
    tenancyEndDate: d.tenancyEndedOn,
    today,
    returnedFully: d.status === "fully_returned",
    landlordClaimFiled: d.status === "landlord_claim_filed" || events.some((e) => e.eventType === "landlord_claim_received"),
  });
  const deductions = events.filter((e) => e.eventType === "deduction_claimed").reduce((s, e) => s + (e.amountCents ?? 0), 0);
  const disputed = events.filter((e) => e.eventType === "deduction_disputed").reduce((s, e) => s + (e.amountCents ?? 0), 0);
  const maxAllowed = d.monthlyRentCents ? Math.floor(d.monthlyRentCents / 2) : null;
  return {
    rule: res,
    deadline: d.tenancyEndedOn ? depositReturnDeadline(d.tenancyEndedOn) : null,
    outstandingCents: Math.max(0, d.amountCents - (d.amountReturnedCents ?? 0)),
    deductionsCents: deductions,
    disputedCents: disputed,
    exceededLimit: maxAllowed !== null && d.amountCents > maxAllowed ? { maxAllowed } : null,
  };
}
