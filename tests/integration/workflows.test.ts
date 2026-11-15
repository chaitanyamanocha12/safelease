import { createTestUser, migrateTestDb } from "../helpers/db";
import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CASE_C_LEASE, LISTING_SCREENSHOT_TEXT, MESSAGE_TEXT } from "@/server/seed/demo-texts";

let u: { id: string };
beforeAll(async () => {
  await migrateTestDb();
  u = await createTestUser("Workflow User", "wf@example.test");
  const { seedReference } = await import("@/server/seed/reference");
  const { db } = await import("@/server/db/client");
  await seedReference(db);
});

describe("discovery, saving and comparison", () => {
  it("searches demo inventory with labels, saves, compares and ranks", async () => {
    const { db } = await import("@/server/db/client");
    const { rentalListing } = await import("@/server/db/schema");
    const { newId } = await import("@/lib/ids");
    for (const [i, rent] of [[1, 150000], [2, 180000], [3, 210000]] as const) await db.insert(rentalListing).values({ id: newId("lst"), sourceKey: "demo_inventory", externalId: `t${i}`, isDemo: true, title: `Demo ${i}`, city: "Halifax", lat: 44.64 + i / 100, lng: -63.58, coordinatesSource: "fictional_demo", rentCents: rent, bedrooms: 2, bathrooms: 1, dataConfidence: "demo" });
    const d = await import("@/server/services/discovery");
    const res = await d.searchRentals(u.id, { city: "Halifax", budgetMax: 2000 });
    expect(res.results).toHaveLength(2);
    expect(res.results.every((r) => r.isDemo)).toBe(true);
    expect(res.statuses.find((s) => s.sourceKey === "demo_inventory")?.status).toBe("DEMO");
    expect(res.statuses.find((s) => s.sourceKey === "partner_feed")?.status).toBe("NOT_CONFIGURED");
    expect(res.externalLinks.map((l) => l.platform)).toContain("Kijiji");
    for (const r of res.results) await d.updateSaved(u.id, r.id, { inComparison: true });
    const c = await d.getComparison(u.id, { anchorKey: "dalhousie" });
    expect(c.ranked).toHaveLength(2);
    expect(c.ranked[0]!.reasons.length).toBeGreaterThan(0);
    const id = await d.saveSearch(u.id, "2BR", { city: "Halifax" }, true);
    expect((await d.listSavedSearches(u.id)).map((s) => s.id)).toContain(id);
  });
  it("imports an external listing privately and starts an investigation", async () => {
    const d = await import("@/server/services/discovery");
    const r = await d.importListing(u.id, { text: LISTING_SCREENSHOT_TEXT, platform: "Kijiji", createInvestigation: true });
    expect(r.investigationId).toBeTruthy();
    const other = await createTestUser("Other", "other-wf@example.test");
    await expect(d.getListingForUser(other.id, r.listingId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("lease review", () => {
  it("analyzes a lease and adds it as investigation evidence", async () => {
    const inv = await import("@/server/services/investigations");
    const L = await import("@/server/services/leases");
    const id = await inv.createInvestigation(u.id, { title: "lease case" });
    const leaseId = await L.createLeaseReview(u.id, { title: "C", investigationId: id, text: CASE_C_LEASE });
    const r = await L.getLeaseReview(u.id, leaseId);
    expect(r.analysis.counts.clear_rule_violation).toBeGreaterThan(0);
    const snap = await inv.loadSnapshot(id);
    expect(snap.evidence.some((e) => e.kind === "lease")).toBe(true);
    await L.addLeaseVersion(u.id, leaseId, { text: CASE_C_LEASE.replace("$1,400 payable", "$700 payable") });
    const r2 = await L.getLeaseReview(u.id, leaseId);
    expect(r2.diff.find((x) => x.field === "Deposit")).toBeTruthy();
  });
});

describe("tenancy workflows", () => {
  it("records an inspection with a photo, then a maintenance case and deposit timeline", async () => {
    const T = await import("@/server/services/tenancy");
    const { validateBuffer } = await import("@/server/seed/upload-helper");
    const t = await T.createTenancy(u.id, { label: "Unit", monthlyRentCents: 140000, status: "active" });
    const insp = await T.createInspection(u.id, t, "move_in", "2026-09-01");
    const item = await T.addInspectionItem(u.id, insp, { room: "kitchen", itemName: "Counter", condition: "damaged", preExisting: true });
    await T.addInspectionPhoto(u.id, item, await validateBuffer(fs.readFileSync(path.resolve("public/demo/listings/listing-01.png")), "p.png"));
    const d = await T.getInspection(u.id, insp);
    expect(d.images).toHaveLength(1);
    const m = await T.createMaintenanceCase(u.id, { title: "Fan", description: "Broken", tenancyId: t, discoveredOn: "2026-09-01" });
    await T.addMaintenanceEvent(u.id, m, { eventType: "landlord_reports_complete", occurredOn: "2026-09-10", description: "Landlord says fixed" });
    const mc = await T.getMaintenanceCase(u.id, m);
    expect(mc.case.status).toBe("landlord_reports_complete"); // not "resolved" until renter confirms
    const dep = await T.createDeposit(u.id, { amountCents: 70000, monthlyRentCents: 140000, tenancyId: t, paidOn: "2026-08-20" });
    await T.addDepositEvent(u.id, dep, { eventType: "tenancy_ended", occurredOn: "2026-08-31", description: "Ended" });
    await T.addDepositEvent(u.id, dep, { eventType: "amount_returned", occurredOn: "2026-09-05", amountCents: 30000, description: "Partial" });
    const { deposit, events } = await T.getDeposit(u.id, dep);
    expect(deposit.status).toBe("partially_returned");
    expect(T.depositStatusSummary(deposit, events, "2026-09-20").deadline).toBe("2026-09-10");
    const D = await import("@/server/services/disputes");
    const ds = await D.createDispute(u.id, { disputeType: "deposit", title: "dispute", tenancyId: t, depositId: dep });
    const pkg = await D.buildPackage(u.id, ds);
    expect(pkg.timeline.length).toBeGreaterThan(2);
    expect(pkg.sources.every((s) => s.url.startsWith("https://"))).toBe(true);
  });
});

describe("reports and exports", () => {
  it("generates PDF, CSV and JSON for an owned investigation", async () => {
    const inv = await import("@/server/services/investigations");
    const { runAgentNow } = await import("@/server/agent/orchestrator");
    const R = await import("@/server/reports/builders");
    const id = await inv.createInvestigation(u.id, { title: "report case" });
    await inv.addEvidence(u.id, id, { kind: "listing_text", title: "L", text: LISTING_SCREENSHOT_TEXT });
    await inv.addEvidence(u.id, id, { kind: "landlord_message", title: "M", text: MESSAGE_TEXT });
    await runAgentNow(u.id, id, { trigger: "manual" });
    const pdf = await R.investigationReport(u.id, id, "pdf");
    expect(Buffer.from(pdf.pdf!).subarray(0, 5).toString()).toBe("%PDF-");
    const csv = await R.investigationReport(u.id, id, "csv");
    expect(csv.csv).toContain("Rule concern");
    const json = (await R.investigationReport(u.id, id, "json")).json as { findings: unknown[]; disclaimer: string };
    expect(json.findings.length).toBeGreaterThan(0);
    expect(json.disclaimer).toMatch(/not legal advice/);
    const pp = await R.prepaymentReport(u.id, id);
    expect(pp.pdf!.length).toBeGreaterThan(1000);
  });
  it("exports all user data and deletes the account with its files", async () => {
    const A = await import("@/server/services/account");
    const victim = await createTestUser("Delete Me", "del@example.test");
    const docs = await import("@/server/services/documents");
    const { validateBuffer } = await import("@/server/seed/upload-helper");
    const s = await docs.storeDocument({ ownerId: victim.id, upload: await validateBuffer(Buffer.from("bye"), "x.txt"), docType: "other" });
    const data = await A.exportUserData(victim.id);
    expect((data.documents as unknown[]).length).toBe(1);
    await A.deleteAccount(victim.id);
    await expect(docs.readOwnedVersion(victim.id, s.versionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("before-you-pay", () => {
  it("never declares a payment safe", async () => {
    const { evaluatePrepayment } = await import("@/server/services/prepayment");
    const r = evaluatePrepayment({ investigationId: "x", claims: [], evidence: [], checks: [{ checkType: "rental_authority", status: "supported" }, { checkType: "independent_contact", status: "supported" }, { checkType: "payment_recipient_consistency", status: "supported" }] }, { requestedAmountCents: 50000, purpose: "security_deposit", leaseSigned: true, viewedInPerson: true, paymentMethod: "cheque" }, []);
    expect(r.headline).toMatch(/can't guarantee/);
  });
});

describe("monitoring jobs", () => {
  it("runs due jobs and records results", async () => {
    const J = await import("@/server/services/jobs");
    const { db } = await import("@/server/db/client");
    const { monitoringJob } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(monitoringJob).set({ status: "paused" }).where(eq(monitoringJob.jobType, "legal_source_review")); // no network in tests
    const res = await J.runDueJobs("manual_runner");
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((r) => r.status !== "failed")).toBe(true);
  });
});
