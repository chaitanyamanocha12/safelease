/** Read model for the investigation board (all data scoped to the owner). */
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { agentRun, claim, claimLink, evidence, finding, investigationAction, investigationEvent, messageDraft, toolRun, verificationCheck, verificationHistory, documentVersion } from "../db/schema";
import { headline } from "../investigation/evaluate";
import type { FindingDraft, VerificationQuestion } from "../investigation/types";
import { getInvestigationForUser, latestToolOutput } from "./investigations";
import { inArray } from "drizzle-orm";

export async function getBoard(userId: string, investigationId: string) {
  const inv = await getInvestigationForUser(userId, investigationId);
  const [evs, claims, links, findings, checks, actions, drafts, runs, events] = await Promise.all([
    db.select().from(evidence).where(eq(evidence.investigationId, inv.id)).orderBy(evidence.createdAt),
    db.select().from(claim).where(eq(claim.investigationId, inv.id)).orderBy(claim.extractedAt),
    db.select().from(claimLink).where(eq(claimLink.investigationId, inv.id)),
    db.select().from(finding).where(eq(finding.investigationId, inv.id)),
    db.select().from(verificationCheck).where(eq(verificationCheck.investigationId, inv.id)),
    db.select().from(investigationAction).where(eq(investigationAction.investigationId, inv.id)).orderBy(desc(investigationAction.createdAt)),
    db.select().from(messageDraft).where(eq(messageDraft.investigationId, inv.id)).orderBy(desc(messageDraft.updatedAt)),
    db.select().from(agentRun).where(eq(agentRun.investigationId, inv.id)).orderBy(desc(agentRun.startedAt)).limit(10),
    db.select().from(investigationEvent).where(eq(investigationEvent.investigationId, inv.id)).orderBy(desc(investigationEvent.createdAt)).limit(300),
  ]);
  const latest = runs[0] ?? null;
  const tools = latest ? await db.select().from(toolRun).where(eq(toolRun.agentRunId, latest.id)).orderBy(toolRun.startedAt) : [];
  const qOut = await latestToolOutput(inv.id, "generate_verification_questions");
  const history = checks.length ? await db.select().from(verificationHistory).where(inArray(verificationHistory.checkId, checks.map((c) => c.id))).orderBy(desc(verificationHistory.createdAt)) : [];
  const versionIds = evs.map((e) => e.documentVersionId).filter((x): x is string => Boolean(x));
  const versions = versionIds.length ? await db.select({ id: documentVersion.id, mimeType: documentVersion.mimeType, fileName: documentVersion.fileName, extractionStatus: documentVersion.extractionStatus, extractionMethod: documentVersion.extractionMethod, pageCount: documentVersion.pageCount }).from(documentVersion).where(inArray(documentVersion.id, versionIds)) : [];
  const active = findings.filter((f) => f.lifecycle === "active");
  const asDraft = active.map((f) => ({ key: f.findingKey, category: f.category, severity: f.severity, label: f.label }) as unknown as FindingDraft);
  return {
    inv,
    evidence: evs.map((e) => ({ ...e, file: versions.find((v) => v.id === e.documentVersionId) ?? null })),
    claims,
    links,
    findings,
    activeFindings: active,
    checks,
    history,
    actions,
    drafts,
    runs,
    latestRun: latest,
    latestTools: tools,
    events,
    questions: ((qOut?.questions as VerificationQuestion[] | undefined) ?? []),
    headline: headline(asDraft),
  };
}

export type Board = Awaited<ReturnType<typeof getBoard>>;
