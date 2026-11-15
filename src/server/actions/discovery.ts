"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "./helpers";
import * as d from "../services/discovery";
import { discoverFiltersSchema, DEFAULT_WEIGHTS } from "@/lib/discover";

const rv = () => {
  revalidatePath("/saved");
  revalidatePath("/compare");
  revalidatePath("/discover", "layout");
};

export const toggleSaveAction = action(z.object({ listingId: z.string(), saved: z.boolean() }), async (u, v) => {
  if (v.saved) await d.saveProperty(u.id, v.listingId);
  else await d.unsaveProperty(u.id, v.listingId);
  rv();
  return null;
});

export const updateSavedAction = action(z.object({ listingId: z.string(), notes: z.string().max(2000).optional(), watch: z.boolean().optional(), inComparison: z.boolean().optional() }), async (u, v) => {
  await d.updateSaved(u.id, v.listingId, { notes: v.notes, watch: v.watch, inComparison: v.inComparison });
  rv();
  return null;
});

export const saveSearchAction = action(z.object({ name: z.string().min(1).max(80), filters: discoverFiltersSchema, alerts: z.boolean() }), async (u, v) => {
  const id = await d.saveSearch(u.id, v.name, v.filters, v.alerts);
  rv();
  return { id };
});

export const deleteSearchAction = action(z.object({ id: z.string() }), async (u, v) => {
  await d.deleteSavedSearch(u.id, v.id);
  rv();
  return null;
});

export const importListingAction = action(
  z.object({ text: z.string().min(20, "Paste the full listing text.").max(20000), sourceUrl: z.string().url().optional().or(z.literal("")), platform: z.string().max(40).optional(), investigate: z.boolean() }),
  async (u, v) => {
    const r = await d.importListing(u.id, { text: v.text, sourceUrl: v.sourceUrl || null, platform: v.platform, createInvestigation: v.investigate });
    rv();
    return r;
  },
);

export const investigateListingAction = action(z.object({ listingId: z.string() }), async (u, v) => {
  const id = await d.investigationFromListing(u.id, v.listingId);
  const { createAgentRun, executeAgentRun } = await import("../agent/orchestrator");
  const { runId } = await createAgentRun(u.id, id, { trigger: "new_evidence" });
  const { after } = await import("next/server");
  after(() => executeAgentRun(runId));
  rv();
  return { investigationId: id };
});

const weights = z.object({ price: z.number().min(0).max(5), distance: z.number().min(0).max(5), space: z.number().min(0).max(5), amenities: z.number().min(0).max(5), evidence: z.number().min(0).max(5) });
export const saveComparisonAction = action(z.object({ weights, anchorKey: z.string().optional(), originInvestigationId: z.string().optional() }), async (u, v) => {
  await d.saveComparisonPrefs(u.id, { weights: v.weights ?? DEFAULT_WEIGHTS, anchorKey: v.anchorKey ?? null, originInvestigationId: v.originInvestigationId || null });
  revalidatePath("/compare");
  return null;
});
