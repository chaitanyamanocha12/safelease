/**
 * Rule metadata lookup. The DB lookup uses each rule's effective (reviewed)
 * version; pending edits never change outcomes until approved.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { legalRule, legalRuleVersion, legalSource } from "../db/schema";
import { LEGAL_RULES, SOURCE_BY_KEY, SOURCE_VERIFIED_ON } from "./catalog";
import type { RuleMeta } from "./rules";

export type RuleLookup = (ruleKey: string) => RuleMeta | null;

export function catalogRuleLookup(): RuleLookup {
  const map = new Map<string, RuleMeta>(
    LEGAL_RULES.map((r) => [
      r.ruleKey,
      {
        ruleKey: r.ruleKey,
        version: 1,
        title: r.title,
        citation: r.citation,
        sourceUrl: SOURCE_BY_KEY.get(r.sourceKey)?.url ?? "",
        reviewStatus: "verified",
        verifiedOn: SOURCE_VERIFIED_ON,
        params: r.params ?? {},
        effectiveFrom: r.effectiveFrom ?? null,
        effectiveTo: r.effectiveTo ?? null,
      },
    ]),
  );
  return (k) => map.get(k) ?? null;
}

export async function loadRuleLookup(db: DB): Promise<RuleLookup> {
  const rows = await db
    .select({
      ruleKey: legalRule.ruleKey,
      active: legalRule.active,
      version: legalRuleVersion.version,
      title: legalRuleVersion.title,
      citation: legalRuleVersion.citation,
      sourceKey: legalRuleVersion.sourceKey,
      reviewStatus: legalRuleVersion.reviewStatus,
      verifiedOn: legalRuleVersion.verifiedOn,
      params: legalRuleVersion.params,
      effectiveFrom: legalRuleVersion.effectiveFrom,
      effectiveTo: legalRuleVersion.effectiveTo,
      url: legalSource.url,
    })
    .from(legalRule)
    .innerJoin(legalRuleVersion, and(eq(legalRuleVersion.ruleId, legalRule.id), eq(legalRuleVersion.version, legalRule.effectiveVersion)))
    .leftJoin(legalSource, eq(legalSource.sourceKey, legalRuleVersion.sourceKey));

  if (rows.length === 0) return catalogRuleLookup();
  const map = new Map<string, RuleMeta>();
  for (const r of rows) {
    if (!r.active) continue;
    map.set(r.ruleKey, {
      ruleKey: r.ruleKey,
      version: r.version,
      title: r.title,
      citation: r.citation,
      sourceUrl: r.url ?? SOURCE_BY_KEY.get(r.sourceKey)?.url ?? "",
      reviewStatus: r.reviewStatus,
      verifiedOn: r.verifiedOn,
      params: r.params ?? {},
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    });
  }
  return (k) => map.get(k) ?? null;
}
