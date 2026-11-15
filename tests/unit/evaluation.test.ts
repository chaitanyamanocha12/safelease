import { describe, expect, it } from "vitest";
import { extractClaims } from "@/server/extraction/extract-claims";
import { evaluateCase, headline } from "@/server/investigation/evaluate";
import { reconcile } from "@/server/investigation/reconcile";
import { catalogRuleLookup } from "@/server/legal/engine";
import { linkConcern } from "@/server/investigation/indicators";
import type { CaseSnapshot } from "@/server/investigation/types";
import * as T from "@/server/seed/demo-texts";

function snapshot(docs: Array<{ id: string; kind: string; text: string; supersedes?: string }>, checks: CaseSnapshot["checks"] = []): CaseSnapshot {
  let n = 0;
  return {
    investigationId: "inv_test",
    evidence: docs.map((d, i) => ({ id: d.id, kind: d.kind as never, title: d.id, createdAt: new Date(2026, 0, 1, 0, i), occurredAt: null, supersedesEvidenceId: d.supersedes ?? null, sourceUrl: null })),
    claims: docs.flatMap((d) => extractClaims(d.text, { sourceKind: d.kind === "lease" ? "lease" : d.kind.startsWith("listing") ? "listing" : "message" }).map((c) => ({ id: `c${n++}`, evidenceId: d.id, claimType: c.claimType, value: c.value, normalized: c.normalized, excerpt: c.excerpt, locator: c.locator, extractor: "deterministic" as const, status: "unverified" as const, supersededAt: null, extractedAt: new Date() }))),
    checks,
  };
}
const keys = (s: CaseSnapshot) => evaluateCase(s, catalogRuleLookup()).findings.map((f) => f.key);

describe("contradiction detection", () => {
  it("detects listing vs lease rent discrepancy", () => {
    const s = snapshot([{ id: "l", kind: "listing_text", text: T.LISTING_SCREENSHOT_TEXT }, { id: "x", kind: "lease", text: T.LEASE_V1_TEXT }]);
    expect(keys(s)).toContain("contradiction:rent");
  });
  it("does not flag compatible lease terms or dates as contradictions", () => {
    const s = snapshot([{ id: "l", kind: "listing_text", text: T.LISTING_SCREENSHOT_TEXT }, { id: "x", kind: "lease", text: T.LEASE_V2_TEXT }]);
    const k = keys(s);
    expect(k).not.toContain("contradiction:rent");
    expect(k).not.toContain("contradiction:lease_term");
    expect(k).not.toContain("contradiction:move_in_date");
  });
  it("uses only the newest version of superseded evidence", () => {
    const s = snapshot([{ id: "l", kind: "listing_text", text: T.LISTING_SCREENSHOT_TEXT }, { id: "v1", kind: "lease", text: T.LEASE_V1_TEXT }, { id: "v2", kind: "lease", text: T.LEASE_V2_TEXT, supersedes: "v1" }]);
    const k = keys(s);
    expect(k).not.toContain("contradiction:rent");
    expect(k).toContain("legal:NS-DEPOSIT-MAX");
  });
  it("records agreements as supports without verifying them", () => {
    const s = snapshot([{ id: "l", kind: "listing_text", text: T.LISTING_SCREENSHOT_TEXT }, { id: "x", kind: "lease", text: T.LEASE_V2_TEXT }]);
    const r = reconcile(s);
    expect(r.links.some((l) => l.relation === "supports")).toBe(true);
    expect(s.claims.every((c) => c.status === "unverified")).toBe(true);
  });
  it("detects a changed payment recipient", () => {
    const s = snapshot([{ id: "m1", kind: "landlord_message", text: "Please e-transfer the deposit to Sarah Whitfield." }, { id: "m2", kind: "landlord_message", text: "Actually please send the money to Mark Olsen instead." }]);
    expect(keys(s)).toContain("contradiction:payment_recipient_changed");
  });
});

describe("uncertainty preservation", () => {
  it("never reports a case with no warnings as safe", () => {
    const s = snapshot([{ id: "l", kind: "listing_text", text: T.CASE_B_LISTING }, { id: "m", kind: "landlord_message", text: T.CASE_B_MESSAGE }]);
    const ev = evaluateCase(s, catalogRuleLookup());
    expect(ev.findings.some((f) => f.severity === "serious")).toBe(false);
    expect(ev.findings.map((f) => f.key)).toContain("gap:rental_authority");
    expect(headline(ev.findings).text).toMatch(/does not mean the listing is legitimate|need clarification/);
    expect(headline(ev.findings).text).not.toMatch(/\bsafe\b/i);
  });
  it("only clears the authority gap after supported verification", () => {
    const s = snapshot([{ id: "l", kind: "listing_text", text: T.CASE_B_LISTING }], [{ checkType: "rental_authority", status: "supported" }]);
    expect(keys(s)).not.toContain("gap:rental_authority");
  });
  it("does not treat low rent or a foreign phone as warning signs", () => {
    const s = snapshot([{ id: "l", kind: "listing_text", text: "Nice 2 bedroom apartment, $600/month. Call +44 20 7946 0958. Viewings available this Saturday." }]);
    const warnings = evaluateCase(s, catalogRuleLookup()).findings.filter((f) => f.category === "warning");
    expect(warnings).toHaveLength(0);
  });
  it("treats landlord living elsewhere as context only", () => {
    const s = snapshot([{ id: "m", kind: "landlord_message", text: "I'm currently living in Toronto, my property manager can show you the unit." }]);
    const f = evaluateCase(s, catalogRuleLookup()).findings.find((x) => x.key === "context:landlord_not_local");
    expect(f?.severity).toBe("info");
  });
});

describe("link analysis", () => {
  it("flags lookalike and shortened links but not official domains", () => {
    expect(linkConcern("https://kijiji-secure-payments.com/pay")).toMatch(/not an official/);
    expect(linkConcern("https://bit.ly/abc")).toMatch(/shortener/);
    expect(linkConcern("https://www.kijiji.ca/v-apartments/123")).toBeNull();
    expect(linkConcern("http://192.168.0.1/x")).toMatch(/IP address/);
  });
});

describe("questions", () => {
  it("generates non-accusatory questions for open findings", () => {
    const s = snapshot([{ id: "l", kind: "listing_text", text: T.LISTING_SCREENSHOT_TEXT }, { id: "m", kind: "landlord_message", text: T.MESSAGE_TEXT }, { id: "x", kind: "lease", text: T.LEASE_V1_TEXT }]);
    const q = evaluateCase(s, catalogRuleLookup()).questions;
    expect(q.map((x) => x.key)).toEqual(expect.arrayContaining(["q:rent", "q:deposit", "q:recipient", "q:viewing"]));
    expect(q.every((x) => !/scam|fraud|liar/i.test(x.question))).toBe(true);
  });
});

describe("AI output safety filter", () => {
  it("rejects certainty claims but allows hedged language", async () => {
    const { makesCertaintyClaim } = await import("@/server/agent/tools/actions");
    expect(makesCertaintyClaim("This listing is verified and safe.")).toBe(true);
    expect(makesCertaintyClaim("This is clearly a scam.")).toBe(true);
    expect(makesCertaintyClaim("The landlord's authority has not been verified. Ask for a viewing.")).toBe(false);
  });
});
