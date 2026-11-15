/** Ingestion + extraction tools: public page fetch, listing/conversation/document analysis. */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { claim, evidence } from "../../db/schema";
import { newId } from "@/lib/ids";
import { env } from "../../env";
import { safeFetchPage, UnsafeUrlError } from "../../security/url-safety";
import { bumpState, extractAndStoreClaims, logEvent } from "../../services/investigations";
import { llm } from "../../providers/llm";
import { llmSupplementaryClaims } from "../llm-extract";
import { hashOf, type AgentTool } from "./types";

export const fetchListingPage: AgentTool<{ evidenceId: string; url: string }> = {
  name: "fetch_listing_page",
  label: "Fetch public listing page",
  description: "Retrieves the text of a public listing URL the renter supplied (SSRF-guarded; skips platforms that restrict automated access).",
  category: "ingestion",
  mandatory: true,
  permission: "external_read",
  candidates(s) {
    if (!env().URL_FETCH_ENABLED) return [];
    return s.evidenceRows
      .filter((e) => e.kind === "listing_url" && !e.textContent && e.sourceUrl && e.processingStatus === "pending")
      .map((e) => ({ inputHash: hashOf([e.id, e.sourceUrl]), reason: "A listing link was added without text.", inputSummary: e.sourceUrl!, input: { evidenceId: e.id, url: e.sourceUrl! } }));
  },
  async run(ctx, s, input) {
    try {
      const page = await safeFetchPage(input.url);
      await db
        .update(evidence)
        .set({
          textContent: `${page.title ? `${page.title}\n` : ""}${page.text}`,
          provenance: "url_fetch",
          processingStatus: "pending",
          processingNote: `Fetched ${page.finalUrl} (HTTP ${page.status})${page.truncated ? ", truncated at size limit" : ""}. Page content is untrusted and unverified.`,
        })
        .where(eq(evidence.id, input.evidenceId));
      await bumpState(s.inv.id);
      return { status: "succeeded", mode: "LIVE", summary: `Fetched ${page.text.length.toLocaleString()} characters from ${new URL(page.finalUrl).hostname}.`, output: { finalUrl: page.finalUrl, httpStatus: page.status, chars: page.text.length }, stateChanged: true };
    } catch (err) {
      const message = err instanceof UnsafeUrlError ? err.message : "The page could not be fetched.";
      await db.update(evidence).set({ processingStatus: "failed", processingNote: `${message} You can paste the listing text or upload a screenshot instead.` }).where(eq(evidence.id, input.evidenceId));
      return { status: "skipped", mode: "NONE", summary: message };
    }
  },
};

function analysisTool(name: string, label: string, description: string, kinds: string[]): AgentTool<{ evidenceId: string }> {
  return {
    name,
    label,
    description,
    category: "extraction",
    mandatory: true,
    permission: "write_case",
    candidates(s) {
      return s.evidenceRows
        .filter((e) => kinds.includes(e.kind) && e.textContent && e.processingStatus === "pending")
        .map((e) => ({ inputHash: hashOf([e.id, e.textContent!.length]), reason: `New ${e.kind.replace(/_/g, " ")} “${e.title}” has not been analyzed.`, inputSummary: e.title, input: { evidenceId: e.id } }));
    },
    async run(ctx, s, input) {
      const det = await extractAndStoreClaims(s.inv.id, input.evidenceId);
      let mode: "DETERMINISTIC" | "LLM" = "DETERMINISTIC";
      let llmNote = "";
      let llmAdded = 0;
      if (llm().configured()) {
        const [ev] = await db.select().from(evidence).where(eq(evidence.id, input.evidenceId));
        const r = await llmSupplementaryClaims({ userId: ctx.userId, investigationId: s.inv.id, purpose: name, callCounter: ctx.llmCounter }, ev!.textContent ?? "", ev!.kind, det.types);
        if (r.ok) {
          mode = "LLM";
          const existing = await db.select({ t: claim.claimType, n: claim.normalized }).from(claim).where(and(eq(claim.evidenceId, input.evidenceId)));
          const have = new Set(existing.map((x) => `${x.t}|${x.n}`));
          const fresh = r.claims.filter((c) => !have.has(`${c.claimType}|${c.normalized}`));
          if (fresh.length) {
            await db.insert(claim).values(
              fresh.map((c) => ({
                id: newId("clm"),
                investigationId: s.inv.id,
                evidenceId: input.evidenceId,
                claimType: c.claimType,
                value: c.value.slice(0, 300),
                normalized: c.normalized.slice(0, 300),
                excerpt: c.excerpt.slice(0, 400),
                locator: "AI-located excerpt",
                extractor: "llm" as const,
                extractionConfidence: "medium" as const,
                status: "unverified" as const,
              })),
            );
          }
          llmAdded = fresh.length;
          llmNote = ` AI found ${fresh.length} additional statement(s)${r.dropped ? `; ${r.dropped} AI suggestion(s) discarded because their quoted text was not in the source` : ""}.${r.injectionDetected ? " The AI flagged possible embedded instructions (ignored)." : ""}`;
        } else {
          llmNote = ` AI extraction unavailable (${r.message}); rule-based extraction only.`;
        }
      }
      await bumpState(s.inv.id);
      const total = det.created + llmAdded;
      await logEvent(s.inv.id, "claims_extracted", "agent", `Extracted ${total} statement(s) from “${s.evidenceRows.find((e) => e.id === input.evidenceId)?.title ?? "evidence"}”. Extracted statements are unverified.`, { evidenceId: input.evidenceId });
      return { status: "succeeded", mode, summary: `Extracted ${det.created} statement(s) with rules.${llmNote}`, output: { deterministic: det.created, llm: llmAdded, types: det.types }, stateChanged: true };
    },
  };
}

export const analyzeListing = analysisTool(
  "analyze_listing",
  "Listing extraction",
  "Extracts advertised terms (rent, deposit, address, layout, utilities, contacts) with source excerpts.",
  ["listing_text", "listing_url", "listing_screenshot", "manual_entry"],
);
export const analyzeConversation = analysisTool(
  "analyze_conversation",
  "Conversation analysis",
  "Extracts claims from landlord messages: amounts, payment instructions, recipients, urgency, viewing availability.",
  ["landlord_message", "landlord_response"],
);
export const analyzeDocument = analysisTool(
  "analyze_document",
  "Document analysis",
  "Extracts lease and document terms with page/line references.",
  ["lease", "pdf_document", "supporting_document", "viewing_note"],
);
