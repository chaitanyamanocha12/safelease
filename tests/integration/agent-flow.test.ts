import { createTestUser, migrateTestDb } from "../helpers/db";
import { beforeAll, describe, expect, it } from "vitest";
import { LEASE_V1, LEASE_V2, LISTING_TEXT, MESSAGE_1 } from "../fixtures/demo-story";

let svc: typeof import("@/server/services/investigations");
let orch: typeof import("@/server/agent/orchestrator");
let dbm: typeof import("@/server/db/client");
let schema: typeof import("@/server/db/schema");
let owner: { id: string };

beforeAll(async () => {
  await migrateTestDb();
  svc = await import("@/server/services/investigations");
  orch = await import("@/server/agent/orchestrator");
  dbm = await import("@/server/db/client");
  schema = await import("@/server/db/schema");
  owner = await createTestUser("Priya Student", "priya@example.test");
});

async function activeKeys(invId: string) {
  const { and, eq } = await import("drizzle-orm");
  const rows = await dbm.db.select().from(schema.finding).where(and(eq(schema.finding.investigationId, invId), eq(schema.finding.lifecycle, "active")));
  return rows.map((r) => r.findingKey);
}

describe("agent end-to-end on the demo story", () => {
  let invId: string;

  it("extracts listing claims and runs mandatory checks", async () => {
    invId = await svc.createInvestigation(owner.id, { title: "South End 2BR", city: "Halifax" });
    await svc.addEvidence(owner.id, invId, { kind: "listing_text", title: "Kijiji ad", text: LISTING_TEXT });
    const runId = await orch.runAgentNow(owner.id, invId, { trigger: "new_evidence" });
    const { run, tools } = await orch.getRunWithTools(owner.id, runId);
    expect(run.status).toBe("completed");
    const names = tools.map((t) => t.tool);
    expect(names).toContain("analyze_listing");
    expect(names).toContain("reconcile_evidence");
    expect(names).toContain("legal_rule_check");
    // No landlord messages → conversation analysis is not needed.
    expect(names).not.toContain("analyze_conversation");
    // Address provider not configured → reported honestly, not as success.
    const addr = tools.find((t) => t.tool === "verify_address");
    expect(addr?.status).toBe("not_configured");
    const keys = await activeKeys(invId);
    expect(keys).toContain("gap:rental_authority");
    expect(keys.some((k) => k.startsWith("contradiction:"))).toBe(false);
  });

  it("detects payment pressure, recipient change and deposit violation after a message", async () => {
    await svc.addEvidence(owner.id, invId, { kind: "landlord_message", title: "Message from Daniel", text: MESSAGE_1 });
    await orch.runAgentNow(owner.id, invId, { trigger: "new_evidence" });
    const keys = await activeKeys(invId);
    expect(keys).toEqual(expect.arrayContaining(["warning:payment_pressure", "warning:viewing_refused", "warning:payment_recipient_differs", "legal:NS-DEPOSIT-MAX", "legal:NS-SIN"]));
  });

  it("finds rent and utilities contradictions when the lease is added and drafts (but does not send) a message", async () => {
    const leaseId = await svc.addEvidence(owner.id, invId, { kind: "lease", title: "Lease v1", text: LEASE_V1 });
    await orch.runAgentNow(owner.id, invId, { trigger: "new_evidence" });
    const keys = await activeKeys(invId);
    expect(keys).toEqual(expect.arrayContaining(["contradiction:rent", "contradiction:utilities:heat", "legal:NS-LATE-FEE", "legal:NS-ENTRY-NOTICE"]));
    const { eq } = await import("drizzle-orm");
    const drafts = await dbm.db.select().from(schema.messageDraft).where(eq(schema.messageDraft.investigationId, invId));
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((d) => d.status === "draft")).toBe(true);
    const actions = await dbm.db.select().from(schema.investigationAction).where(eq(schema.investigationAction.investigationId, invId));
    expect(actions.find((a) => a.actionType === "send_message")?.status).toBe("proposed");

    // Revised lease resolves rent + utilities but deposit concern remains (Case F)
    await svc.addEvidence(owner.id, invId, { kind: "lease", title: "Lease v2 (revised)", text: LEASE_V2, supersedesEvidenceId: leaseId });
    await orch.runAgentNow(owner.id, invId, { trigger: "new_evidence" });
    const after = await activeKeys(invId);
    expect(after).not.toContain("contradiction:rent");
    expect(after).not.toContain("contradiction:utilities:heat");
    expect(after).toContain("legal:NS-DEPOSIT-MAX");
    const resolved = await dbm.db.select().from(schema.finding).where(eq(schema.finding.findingKey, "contradiction:rent"));
    expect(resolved[0]?.lifecycle).toBe("resolved");
    expect(resolved[0]?.resolutionNote).toMatch(/revised document/);
    // Prior evidence preserved
    const ev = await dbm.db.select().from(schema.evidence).where(eq(schema.evidence.investigationId, invId));
    expect(ev.find((e) => e.id === leaseId)).toBeTruthy();
  });

  it("is idempotent: a re-run with no changes performs no repeated tool work", async () => {
    const runId = await orch.runAgentNow(owner.id, invId, { trigger: "manual" });
    const { tools } = await orch.getRunWithTools(owner.id, runId);
    expect(tools.filter((t) => t.tool === "reconcile_evidence")).toHaveLength(0);
  });
});
