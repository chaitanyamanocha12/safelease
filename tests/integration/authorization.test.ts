import { createTestUser, migrateTestDb } from "../helpers/db";
import { beforeAll, describe, expect, it } from "vitest";
import { LISTING_SCREENSHOT_TEXT, MESSAGE_TEXT } from "@/server/seed/demo-texts";

let alice: { id: string }, bob: { id: string }, adviser: { id: string }, outsider: { id: string };
let inv: typeof import("@/server/services/investigations");
let org: typeof import("@/server/services/organizations");
let docs: typeof import("@/server/services/documents");
let reports: typeof import("@/server/reports/builders");
let caseId: string;

beforeAll(async () => {
  await migrateTestDb();
  inv = await import("@/server/services/investigations");
  org = await import("@/server/services/organizations");
  docs = await import("@/server/services/documents");
  reports = await import("@/server/reports/builders");
  alice = await createTestUser("Alice Renter", "alice@example.test");
  bob = await createTestUser("Bob Other", "bob@example.test");
  adviser = await createTestUser("Ada Adviser", "ada@example.test");
  outsider = await createTestUser("Oscar Outsider", "oscar@example.test");
  caseId = await inv.createInvestigation(alice.id, { title: "Alice's case", city: "Halifax" });
  await inv.addEvidence(alice.id, caseId, { kind: "listing_text", title: "Listing", text: LISTING_SCREENSHOT_TEXT });
  await inv.addEvidence(alice.id, caseId, { kind: "landlord_message", title: "Msg", text: MESSAGE_TEXT });
  const { runAgentNow } = await import("@/server/agent/orchestrator");
  await runAgentNow(alice.id, caseId, { trigger: "manual" });
});

describe("tenant data isolation", () => {
  it("refuses cross-user investigation access as NOT_FOUND", async () => {
    await expect(inv.getInvestigationForUser(bob.id, caseId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(inv.addEvidence(bob.id, caseId, { kind: "listing_text", title: "x", text: "y" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(reports.investigationReport(bob.id, caseId, "json")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("refuses cross-user claim correction and document access", async () => {
    const { db } = await import("@/server/db/client");
    const { claim } = await import("@/server/db/schema");
    const [c] = await db.select().from(claim).limit(1);
    await expect(inv.correctClaim(bob.id, c!.id, "$1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { validateBuffer } = await import("@/server/seed/upload-helper");
    const stored = await docs.storeDocument({ ownerId: alice.id, upload: await validateBuffer(Buffer.from("private lease text"), "lease.txt"), docType: "lease" });
    await expect(docs.readOwnedVersion(bob.id, stored.versionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const own = await docs.readOwnedVersion(alice.id, stored.versionId);
    expect(own.bytes.toString()).toBe("private lease text");
  });
});

describe("consent-based organization sharing (Case J)", () => {
  let orgId: string;
  let referralId: string;
  it("membership alone grants no access", async () => {
    orgId = await org.createOrganization(outsider.id, { name: "Test Union", orgType: "student_union" });
    const { db } = await import("@/server/db/client");
    const { organizationMembership } = await import("@/server/db/schema");
    const { newId } = await import("@/lib/ids");
    await db.insert(organizationMembership).values([{ id: newId("mem"), orgId, userId: adviser.id, role: "adviser" }, { id: newId("mem"), orgId, userId: alice.id, role: "member" }]);
    expect(await org.listReferrals(adviser.id, orgId)).toHaveLength(0);
    await expect(org.listReferrals(alice.id, orgId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("adviser sees a redacted case only after explicit consent", async () => {
    await org.grantConsent(alice.id, { orgId, investigationId: caseId, scope: "redacted" });
    const refs = await org.listReferrals(adviser.id, orgId);
    expect(refs).toHaveLength(1);
    referralId = refs[0]!.id;
    expect(refs[0]!.renter).toBe("A. R.");
    const shared = await org.getSharedCase(adviser.id, orgId, referralId);
    const blob = JSON.stringify(shared);
    expect(blob).not.toContain("Alice");
    expect(blob).not.toContain("5521 Harbourview");
    expect(blob).not.toContain("s.whitfield.payments@example.com");
    expect(blob).not.toContain("555-0142");
    expect(shared.facts.some((f) => f.type === "address" || f.type === "payment_recipient")).toBe(false);
    expect(shared.findings.length).toBeGreaterThan(0);
  });
  it("a non-member cannot view the shared case", async () => {
    await expect(org.getSharedCase(bob.id, orgId, referralId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("revocation takes effect immediately", async () => {
    const grants = await org.listMyConsents(alice.id);
    await org.revokeConsent(alice.id, grants[0]!.grant.id);
    await expect(org.getSharedCase(adviser.id, orgId, referralId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await org.listReferrals(adviser.id, orgId)).toHaveLength(0);
  });
  it("suppresses small aggregate counts", async () => {
    const a = await org.organizationAggregates(adviser.id, orgId);
    expect(a.totalShared).toBe("<5");
    expect(a.belowThreshold).toBe(true);
  });
  it("records denied access in the audit log", async () => {
    const { db } = await import("@/server/db/client");
    const { auditEvent } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const denied = await db.select().from(auditEvent).where(eq(auditEvent.outcome, "denied"));
    expect(denied.length).toBeGreaterThan(0);
    expect(JSON.stringify(denied)).not.toContain("Sarah Whitfield");
  });
});
