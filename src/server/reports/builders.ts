/**
 * Report builders. Each returns { pdf?, json?, csv? } for an owned resource.
 * Evidence provenance (user-supplied vs provider-verified) is labeled throughout.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { communication, evidence, inspection, inspectionItem } from "../db/schema";
import { caseReference } from "@/lib/ids";
import { formatCents } from "@/lib/money";
import { getBoard } from "../services/board";
import { getPrepayment } from "../services/prepayment";
import { getLeaseReview } from "../services/leases";
import { getComparison, getListingForUser } from "../services/discovery";
import { analyzeMaintenance, compareInspections, depositStatusSummary, getDeposit, getInspection, getMaintenanceCase, getTenancy } from "../services/tenancy";
import { getDispute, type DisputePackage } from "../services/disputes";
import { organizationAggregates } from "../services/organizations";
import { LEGAL_DISCLAIMER } from "../legal/catalog";
import { AUTHORITY_UNVERIFIED } from "../investigation/gaps";
import { ReportPdf, STANDARD_LIMITATIONS, type Tone } from "./pdf";
import type { LeaseTerms } from "../leases/analyze";

export type ReportOutput = { pdf?: Uint8Array; json?: unknown; csv?: string; filename: string };

const SEV_TONE: Record<string, Tone> = { serious: "bad", caution: "warn", info: "info" };
const LABEL: Record<string, string> = {
  supported: "Supported by evidence",
  contradicted: "Contradicted by evidence",
  warning: "Potential warning sign",
  unverified: "Unverified",
  not_checked: "Not checked",
  provider_unavailable: "Provider unavailable",
  needs_review: "Requires human review",
};
const PROV: Record<string, string> = { user_supplied: "User-supplied", url_fetch: "Fetched public page (unverified)", ocr_local: "User-supplied image, OCR text", ocr_provider: "User-supplied image, OCR provider text", llm_vision: "User-supplied image, AI transcription", pdf_text: "User-supplied PDF text", provider: "Provider" };

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // CSV-injection guard
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

export async function investigationReport(userId: string, id: string, format: string): Promise<ReportOutput> {
  const b = await getBoard(userId, id);
  const ref = caseReference(b.inv.id);
  const evTitle = new Map(b.evidence.map((e) => [e.id, e.title]));
  if (format === "json") {
    return {
      filename: `safelease-${ref}.json`,
      json: {
        reference: ref,
        generatedAt: new Date().toISOString(),
        disclaimer: LEGAL_DISCLAIMER,
        investigation: { id: b.inv.id, title: b.inv.title, city: b.inv.city, status: b.inv.status, isDemo: b.inv.isDemo, summary: b.inv.summary },
        evidence: b.evidence.map((e) => ({ id: e.id, kind: e.kind, title: e.title, provenance: e.provenance, createdAt: e.createdAt, occurredAt: e.occurredAt, supersedesEvidenceId: e.supersedesEvidenceId, sourceUrl: e.sourceUrl, text: e.textContent })),
        claims: b.claims.map((c) => ({ id: c.id, evidenceId: c.evidenceId, type: c.claimType, value: c.value, excerpt: c.excerpt, locator: c.locator, extractor: c.extractor, status: c.status, superseded: Boolean(c.supersededAt) })),
        links: b.links,
        findings: b.findings.map((f) => ({ key: f.findingKey, category: f.category, label: f.label, severity: f.severity, lifecycle: f.lifecycle, title: f.title, explanation: f.explanation, recommendation: f.recommendation, citation: f.citationLabel, citationUrl: f.citationUrl, ruleVersion: f.ruleVersion, claimIds: f.claimIds, resolutionNote: f.resolutionNote })),
        verification: b.checks.map((c) => ({ type: c.checkType, status: c.status, method: c.method, summary: c.summary, performedBy: c.performedBy, providerMode: c.providerMode, checkedAt: c.checkedAt })),
        actions: b.actions.map((a) => ({ title: a.title, status: a.status, verificationNote: a.verificationNote })),
        runs: b.runs.map((r) => ({ id: r.id, trigger: r.trigger, status: r.status, plannerMode: r.plannerMode, toolCalls: r.toolCalls, startedAt: r.startedAt, summary: r.summary })),
        timeline: b.events.map((e) => ({ at: e.createdAt, actor: e.actor, message: e.message })),
      },
    };
  }
  if (format === "csv") {
    return {
      filename: `safelease-${ref}-findings.csv`,
      csv: toCsv(["status", "severity", "category", "evidence_label", "title", "explanation", "citation", "citation_url", "first_detected"], b.findings.map((f) => [f.lifecycle, f.severity, f.category, LABEL[f.label] ?? f.label, f.title, f.explanation, f.citationLabel, f.citationUrl, f.firstDetectedAt.toISOString()])),
    };
  }
  const pdf = await ReportPdf.create("Rental Investigation Report", ref, `${b.inv.title}${b.inv.city ? ` · ${b.inv.city}` : ""}${b.inv.isDemo ? " · DEMO (fictional)" : ""}`);
  pdf.callout(b.headline.text, b.headline.tone === "serious" ? "bad" : b.headline.tone === "caution" ? "warn" : "neutral", "Overview");
  if (b.inv.summary) pdf.paragraph(b.inv.summary);
  const auth = b.checks.find((c) => c.checkType === "rental_authority");
  pdf.callout(auth?.status === "supported" ? `Renter-reported verification: ${auth.summary ?? ""}` : AUTHORITY_UNVERIFIED, auth?.status === "supported" ? "ok" : "neutral", "Rental authority");
  pdf.heading("Findings");
  const active = b.findings.filter((f) => f.lifecycle === "active");
  for (const f of active) {
    const src = f.claimIds.map((cid) => b.claims.find((c) => c.id === cid)).filter(Boolean).slice(0, 3).map((c) => `${evTitle.get(c!.evidenceId)}${c!.locator ? ` (${c!.locator})` : ""}`);
    pdf.callout(`${f.explanation}${f.recommendation ? `\nSuggested step: ${f.recommendation}` : ""}${f.citationLabel ? `\nSource: ${f.citationLabel} — ${f.citationUrl}` : ""}${src.length ? `\nEvidence: ${src.join("; ")}` : ""}`, SEV_TONE[f.severity] ?? "info", `[${f.severity.toUpperCase()} · ${LABEL[f.label] ?? f.label}] ${f.title}`);
  }
  if (active.length === 0) pdf.paragraph("No active findings. This does not establish that the listing is legitimate.", { muted: true });
  pdf.heading("Extracted statements (not verified)");
  const sup = new Set(b.evidence.map((e) => e.supersedesEvidenceId).filter(Boolean));
  pdf.table(["Field", "Value", "Source", "Status"], b.claims.filter((c) => !c.supersededAt && !sup.has(c.evidenceId) && c.claimType !== "listing_title").map((c) => [c.claimType.replace(/_/g, " "), c.value, `${evTitle.get(c.evidenceId) ?? ""} ${c.locator ?? ""}`, LABEL[c.status] ?? c.status]), [110, 160, 170, 76]);
  pdf.heading("Verification checks");
  pdf.table(["Check", "Status", "How", "Performed by"], b.checks.map((c) => [c.checkType.replace(/_/g, " "), c.status.replace(/_/g, " "), c.summary ?? c.method ?? "", c.providerMode === "USER" ? "Renter-reported" : c.providerMode === "LIVE" ? "External provider" : c.providerMode ?? "—"]), [120, 80, 230, 86]);
  if (b.questions.length) {
    pdf.heading("Recommended verification questions");
    pdf.bullets(b.questions.map((q) => q.question));
  }
  pdf.heading("Evidence inventory");
  pdf.table(["Evidence", "Type", "Provenance", "Added"], b.evidence.map((e) => [`${e.title}${sup.has(e.id) ? " (superseded, preserved)" : ""}`, e.kind.replace(/_/g, " "), PROV[e.provenance] ?? e.provenance, e.createdAt.toISOString().slice(0, 10)]), [180, 100, 160, 76]);
  const resolved = b.findings.filter((f) => f.lifecycle !== "active");
  if (resolved.length) {
    pdf.heading("Resolved findings (history)");
    pdf.bullets(resolved.map((f) => `${f.title} — ${f.resolutionNote ?? f.lifecycle}`));
  }
  pdf.heading("Investigation history");
  pdf.bullets(b.runs.slice(0, 5).map((r) => `${r.startedAt.toISOString().slice(0, 16).replace("T", " ")} · ${r.trigger.replace("_", " ")} · ${r.plannerMode === "llm" ? "AI-assisted planner" : "deterministic planner"} · ${r.status} · ${r.summary ?? ""}`));
  return { filename: `safelease-${ref}.pdf`, pdf: await pdf.finish(STANDARD_LIMITATIONS) };
}

export async function verificationReport(userId: string, id: string): Promise<ReportOutput> {
  const b = await getBoard(userId, id);
  const ref = caseReference(id);
  const pdf = await ReportPdf.create("Landlord Verification Checklist", ref, b.inv.title);
  pdf.callout(AUTHORITY_UNVERIFIED + " Registered ownership (where available) does not by itself prove that the person you are dealing with may rent the unit.", "neutral");
  const items = ["rental_authority", "independent_contact", "viewing_confirmed", "payment_recipient_consistency", "lease_matches_listing", "address_validity", "public_business_info", "image_reuse_local", "image_reuse_web"];
  pdf.table(["Check", "Status", "Detail", "Source"], items.map((t) => { const c = b.checks.find((x) => x.checkType === t); return [t.replace(/_/g, " "), c?.status.replace(/_/g, " ") ?? "not checked", c?.summary ?? "", c ? (c.providerMode === "USER" ? "Renter-reported" : c.providerMode ?? "") : "—"]; }), [120, 80, 240, 76]);
  pdf.heading("How to verify independently");
  pdf.bullets(["Find the property manager's website or listing yourself and call the number published there.", "Ask for a viewing in person or by live video with someone who can show the unit and building entrance.", "Confirm the payment recipient matches the landlord or a documented property manager.", "Never pay through gift cards, cryptocurrency or wire services; avoid paying before viewing and signing."]);
  return { filename: `safelease-${ref}-verification.pdf`, pdf: await pdf.finish(STANDARD_LIMITATIONS) };
}

export async function prepaymentReport(userId: string, id: string): Promise<ReportOutput> {
  const b = await getBoard(userId, id);
  const pp = await getPrepayment(userId, id);
  const ref = caseReference(id);
  const pdf = await ReportPdf.create("Before-You-Pay Safety Report", ref, b.inv.title);
  pdf.callout(pp.result.headline, pp.result.concerns ? "bad" : "warn", "Summary");
  pdf.table(["Item", "Result", "Detail"], pp.result.items.map((i) => [i.label, i.status === "concern" ? "Concern" : i.status === "ok" ? "No issue found" : "Unknown", `${i.detail}${i.citationLabel ? ` (${i.citationLabel})` : ""}`]), [140, 80, 296]);
  pdf.heading("Your checklist");
  pdf.bullets(Object.entries(pp.input.checklist ?? {}).map(([k, v]) => `${v ? "[x]" : "[ ]"} ${k}`));
  return { filename: `safelease-${ref}-before-you-pay.pdf`, pdf: await pdf.finish(["SafeLease never guarantees that a payment is safe and never moves money.", ...STANDARD_LIMITATIONS]) };
}

export async function correspondenceReport(userId: string, id: string, format: string): Promise<ReportOutput> {
  const b = await getBoard(userId, id);
  const out = await db.select().from(communication).where(and(eq(communication.ownerId, userId), eq(communication.investigationId, id)));
  const msgs = [
    ...b.evidence.filter((e) => e.kind === "landlord_message" || e.kind === "landlord_response").map((e) => ({ when: (e.occurredAt ?? e.createdAt).toISOString(), dir: "Received", body: e.textContent ?? "(file)" })),
    ...out.filter((o) => o.direction === "outbound").map((o) => ({ when: (o.occurredAt ?? o.createdAt).toISOString(), dir: o.channel === "email" ? "Sent (email provider accepted)" : "Sent by renter (self-reported)", body: o.body })),
  ].sort((a, c) => a.when.localeCompare(c.when));
  const ref = caseReference(id);
  if (format === "json") return { filename: `safelease-${ref}-correspondence.json`, json: msgs };
  const pdf = await ReportPdf.create("Correspondence Record", ref, b.inv.title);
  for (const m of msgs) {
    pdf.heading(`${m.dir} · ${m.when.slice(0, 16).replace("T", " ")}`);
    pdf.paragraph(m.body);
  }
  return { filename: `safelease-${ref}-correspondence.pdf`, pdf: await pdf.finish(STANDARD_LIMITATIONS) };
}

export async function leaseReport(userId: string, id: string): Promise<ReportOutput> {
  const r = await getLeaseReview(userId, id);
  const t = r.latest.terms as unknown as LeaseTerms;
  const pdf = await ReportPdf.create("Lease Review Report", `LEASE-${id.slice(-8).toUpperCase()}`, `${r.lease.title} · version ${r.latest.version}${r.lease.isDemo ? " · DEMO" : ""}`);
  pdf.heading("Key terms (as written in the lease)");
  pdf.keyValues([["Monthly rent", t.rentCents ? formatCents(t.rentCents) : "Not found"], ["Deposit", t.depositCents !== null ? formatCents(t.depositCents) : "Not found"], ["Lease type", t.leaseType.replace(/_/g, " ")], ["Start / end", `${t.startDate ?? "?"} / ${t.endDate ?? "?"}`], ["Utilities included", t.utilitiesIncluded.join(", ") || "None stated"], ["Tenant pays", t.utilitiesTenantPays.join(", ") || "None stated"], ["Late fee", t.lateFee ?? "Not stated"]]);
  pdf.heading("Flagged clauses");
  const flagged = r.clauses.filter((c) => c.classification !== "standard");
  for (const c of flagged) pdf.callout(`${c.explanation ?? ""}\n"${c.text.slice(0, 300)}"${c.citationUrl ? `\nSource: ${c.citationUrl}` : ""}`, c.classification === "clear_rule_violation" ? "bad" : c.classification === "potential_issue" ? "warn" : "info", `${c.classification.replace(/_/g, " ")}${c.page ? ` · page ${c.page}` : ""}`);
  if (!flagged.length) pdf.paragraph("No clauses flagged.", { muted: true });
  if (r.analysis.missingTerms.length) {
    pdf.heading("Missing or unclear terms");
    pdf.bullets(r.analysis.missingTerms);
  }
  if (r.analysis.comparison.length) {
    pdf.heading("Lease vs listing");
    pdf.table(["Term", "Lease", "Listing", "Match"], r.analysis.comparison.map((c) => [c.field, c.lease, c.listing, c.match ? "Yes" : "No"]));
  }
  if (r.diff.length) {
    pdf.heading("Changes from previous version");
    pdf.table(["Term", "Before", "After"], r.diff.map((d) => [d.field, d.before, d.after]));
  }
  pdf.heading("Questions to ask");
  pdf.bullets(r.analysis.questions);
  return { filename: `safelease-lease-${id.slice(-8)}.pdf`, pdf: await pdf.finish(STANDARD_LIMITATIONS) };
}

export async function comparisonReport(userId: string): Promise<ReportOutput> {
  const c = await getComparison(userId);
  const pdf = await ReportPdf.create("Property Comparison Report", "COMPARE", `Ranked by your preferences · distance from ${c.anchor?.label ?? "—"}`);
  pdf.keyValues(Object.entries(c.weights).map(([k, v]) => [`Weight: ${k}`, String(v)]));
  pdf.table(["#", "Listing", "Rent", "Beds/Baths", "Distance", "Score", "Why"], c.ranked.map((r, i) => [String(i + 1), `${r.listing.title}${r.listing.isDemo ? " (DEMO)" : ""}`, r.listing.rentCents ? formatCents(r.listing.rentCents) : "—", `${r.listing.bedrooms ?? "?"}/${r.listing.bathrooms ?? "?"}`, r.listing.distanceKm !== null ? `${r.listing.distanceKm} km` : "—", String(Math.round(r.score * 100)), r.reasons.join("; ")]), [20, 130, 54, 54, 54, 40, 164]);
  return { filename: "safelease-comparison.pdf", pdf: await pdf.finish(["Ranking reflects your weights; low rent is never treated as evidence of fraud.", "Distances are straight-line; commute times are not estimated without a routing provider.", ...STANDARD_LIMITATIONS]) };
}

export async function listingExport(userId: string, id: string): Promise<ReportOutput> {
  const l = await getListingForUser(userId, id);
  return { filename: `listing-${id}.json`, json: { ...l, notice: l.isDemo ? "Fictional SafeLease demo listing — not real or available." : "Availability and details are unverified." } };
}

export async function inspectionReport(userId: string, id: string): Promise<ReportOutput> {
  const d = await getInspection(userId, id);
  const pdf = await ReportPdf.create(`${d.inspection.kind === "move_in" ? "Move-In" : "Move-Out"} Inspection Report`, `INSP-${id.slice(-8).toUpperCase()}`, `${d.tenancy.label}${d.tenancy.isDemo ? " · DEMO" : ""}`);
  pdf.callout("This report organizes the renter's own observations and photos. It is not the official signed Nova Scotia Rental Unit Condition Report: https://www.novascotia.ca/rental-unit-condition-report-form", "info");
  pdf.keyValues([["Inspection date", d.inspection.inspectedOn ?? "—"], ["Landlord present", d.inspection.landlordPresent ? "Yes" : d.inspection.landlordPresent === false ? "No" : "—"], ["Witness", d.inspection.witnessName ?? "—"], ["Official form completed", d.inspection.officialFormCompleted ? "Yes (per renter)" : "Not recorded"], ["Notes", d.inspection.notes ?? "—"]]);
  pdf.table(["Room", "Item", "Condition", "Pre-existing", "Description", "Photos"], d.items.map((i) => [i.room.replace("_", " ") + (i.roomLabel ? ` (${i.roomLabel})` : ""), i.itemName, i.condition.replace("_", " "), i.preExisting ? "Yes" : "", i.description ?? "", String(d.images.filter((m) => m.img.inspectionItemId === i.id).length)]), [70, 80, 60, 55, 200, 51]);
  if (d.inspection.kind === "move_out") {
    const [mi] = await db.select().from(inspection).where(and(eq(inspection.tenancyId, d.tenancy.id), eq(inspection.kind, "move_in")));
    if (mi) {
      const cmp = compareInspections(await db.select().from(inspectionItem).where(eq(inspectionItem.inspectionId, mi.id)), d.items);
      pdf.heading("Move-in vs move-out");
      pdf.table(["Room", "Item", "Move-in", "Move-out", "Change"], cmp.map((r) => [r.room, r.itemName, r.moveIn ?? "—", r.moveOut ?? "—", r.change.replace(/_/g, " ")]));
    }
  }
  return { filename: `inspection-${id.slice(-8)}.pdf`, pdf: await pdf.finish(STANDARD_LIMITATIONS) };
}

export async function maintenanceReport(userId: string, id: string): Promise<ReportOutput> {
  const { case: c, events } = await getMaintenanceCase(userId, id);
  const a = analyzeMaintenance(c, events);
  const pdf = await ReportPdf.create("Maintenance Evidence Timeline", `MNT-${id.slice(-8).toUpperCase()}`, `${c.title}${c.isDemo ? " · DEMO" : ""}`);
  pdf.keyValues([["Status", c.status.replace(/_/g, " ")], ["Severity", c.severity], ["Location", c.location ?? "—"], ["Discovered", c.discoveredOn ?? "—"], ["Reported", c.reportedOn ?? "—"], ["Promised by", c.promisedBy ?? "—"], ["Renter confirmed resolved", c.confirmedResolvedOn ?? "No"]]);
  pdf.paragraph(c.description);
  pdf.heading("Timeline");
  pdf.table(["Date", "Event", "Details"], events.map((e) => [e.occurredOn, e.eventType.replace(/_/g, " "), `${e.description}${e.promisedDate ? ` (promised ${e.promisedDate})` : ""}${e.documentId ? " [attachment]" : ""}`]), [70, 110, 336]);
  for (const f of a.flags) pdf.callout(f.text, f.tone === "bad" ? "bad" : f.tone === "warn" ? "warn" : "info");
  for (const x of a.conflicts) pdf.callout(x, "warn", "Conflicting promises");
  if (a.missing.length) { pdf.heading("Missing information"); pdf.bullets(a.missing); }
  return { filename: `maintenance-${id.slice(-8)}.pdf`, pdf: await pdf.finish(["A landlord's statement that a repair is complete is recorded as such; completion is confirmed only by the renter.", ...STANDARD_LIMITATIONS]) };
}

export async function depositReport(userId: string, id: string): Promise<ReportOutput> {
  const { deposit: d, events } = await getDeposit(userId, id);
  const s = depositStatusSummary(d, events);
  const t = d.tenancyId ? await getTenancy(userId, d.tenancyId) : null;
  const pdf = await ReportPdf.create("Deposit Protection Report", `DEP-${id.slice(-8).toUpperCase()}`, `${t?.label ?? "Security deposit"}${d.isDemo ? " · DEMO" : ""}`);
  pdf.keyValues([["Amount paid", formatCents(d.amountCents)], ["Paid on / to", `${d.paidOn ?? "—"} / ${d.paidTo ?? "—"}`], ["Tenancy ended", d.tenancyEndedOn ?? "—"], ["Return or claim deadline", s.deadline ?? "—"], ["Returned", formatCents(d.amountReturnedCents ?? 0)], ["Outstanding", formatCents(s.outstandingCents)], ["Disputed deductions", formatCents(s.disputedCents)]]);
  pdf.callout(s.rule.explanation, s.rule.outcome === "potential_issue" ? "warn" : "info", `${s.rule.title} — ${s.rule.citation}`);
  pdf.heading("Events");
  pdf.table(["Date", "Event", "Amount", "Details"], events.map((e) => [e.occurredOn, e.eventType.replace(/_/g, " "), e.amountCents ? formatCents(e.amountCents) : "", e.description]), [70, 110, 70, 266]);
  pdf.paragraph("Official forms: https://www.novascotia.ca/residential-tenancy-forms (Application to Director to return a security deposit, Form S).", { muted: true });
  return { filename: `deposit-${id.slice(-8)}.pdf`, pdf: await pdf.finish(STANDARD_LIMITATIONS) };
}

export async function disputeReport(userId: string, id: string, format: string): Promise<ReportOutput> {
  const d = await getDispute(userId, id);
  const p = d.package as unknown as DisputePackage;
  if (format === "json") return { filename: `dispute-${id.slice(-8)}.json`, json: { ...p, title: d.title, type: d.disputeType } };
  const pdf = await ReportPdf.create("Dispute Evidence Package", `DSP-${id.slice(-8).toUpperCase()}`, `${d.title} · ${d.disputeType.replace(/_/g, " ")}${d.isDemo ? " · DEMO" : ""}`);
  pdf.callout("Prepared by the renter with SafeLease. Not a filed claim. Review all items before sharing.", "info");
  pdf.heading("Case summary");
  pdf.paragraph(p.summary);
  pdf.heading("Timeline of events");
  pdf.table(["Date", "Event", "Source"], p.timeline.map((t) => [t.date, t.event, t.source]), [70, 350, 96]);
  pdf.heading("Supporting evidence");
  pdf.bullets(p.evidence.map((e) => `${e.label}: ${e.detail}`));
  pdf.heading("Document inventory");
  pdf.table(["Document", "Type", "Uploaded"], p.documents.map((x) => [x.title, x.type.replace(/_/g, " "), x.uploaded]));
  pdf.heading("Relevant official sources");
  pdf.bullets(p.sources.map((s) => `${s.title} — ${s.url}`));
  pdf.heading("Questions requiring legal advice");
  pdf.bullets(p.questionsForLegalAdvice);
  if (p.outstandingFacts.length) { pdf.heading("Outstanding facts"); pdf.bullets(p.outstandingFacts); }
  return { filename: `dispute-${id.slice(-8)}.pdf`, pdf: await pdf.finish(["SafeLease does not file claims and does not predict outcomes.", ...STANDARD_LIMITATIONS]) };
}

export async function organizationReport(userId: string, orgId: string, format: string): Promise<ReportOutput> {
  const a = await organizationAggregates(userId, orgId);
  if (format === "csv") return { filename: `org-aggregate-${orgId.slice(-6)}.csv`, csv: toCsv(["metric", "value"], [["total_shared", a.totalShared], ["active_shared", a.activeShared], ["revoked", a.revoked], ...a.themes.map((t) => [t.theme, t.count]), ...a.byStatus.map((s) => [`status_${s.status}`, s.count])]) };
  const pdf = await ReportPdf.create("Organization Aggregate Report", a.org.slug, `${a.org.name} · minimum group size ${a.minGroupSize}`);
  pdf.callout(`Counts below ${a.minGroupSize} are shown as "<${a.minGroupSize}" to protect individuals. Only cases renters explicitly shared are included.`, "info");
  pdf.keyValues([["Cases shared (all time)", String(a.totalShared)], ["Currently shared", String(a.activeShared)], ["Sharing revoked", String(a.revoked)]]);
  pdf.heading("Common themes in shared cases");
  pdf.table(["Theme", "Cases"], a.themes.map((t) => [t.theme, String(t.count)]));
  pdf.heading("Referral status");
  pdf.table(["Status", "Count"], a.byStatus.map((s) => [s.status.replace(/_/g, " "), String(s.count)]));
  return { filename: `org-aggregate-${orgId.slice(-6)}.pdf`, pdf: await pdf.finish(["Aggregates reflect consented cases only and are not representative of all renters.", ...STANDARD_LIMITATIONS]) };
}

void evidence;
