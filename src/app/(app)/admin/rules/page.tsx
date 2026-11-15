import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/server/auth/session";
import { listRules } from "@/server/services/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout, PageHeader } from "@/components/ui/misc";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { SimpleActionButton } from "@/components/forms/simple-action-button";
import { AdminNav } from "@/components/shell/admin-nav";
import { proposeRuleAction, reviewRuleAction } from "@/server/actions/admin";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Legal rules" };

export default async function RulesPage() {
  const admin = await requirePlatformAdmin();
  const rules = await listRules(admin);
  return (
    <>
      <PageHeader title="Legal rule management" description="Versioned Nova Scotia rules. Logic is deterministic code; this page manages wording, parameters and review." />
      <AdminNav active="/admin/rules" />
      <Callout tone="warn" className="mb-6">Proposed changes stay <strong>pending review</strong> and do not affect any outcome until a different administrator approves them. Verify against the official source before approving.</Callout>
      <div className="space-y-4">
        {rules.map(({ rule, versions }) => {
          const eff = versions.find((v) => v.version === rule.effectiveVersion);
          const pending = versions.find((v) => v.reviewStatus === "pending_review");
          return (
            <Card key={rule.id}>
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div><div className="font-mono text-xs text-muted-foreground">{rule.ruleKey} · {rule.jurisdiction} · logic: {rule.logicKey}</div><CardTitle>{eff?.title}</CardTitle></div>
                <div className="flex gap-1"><Badge tone="ok">v{rule.effectiveVersion} effective</Badge>{pending ? <Badge tone="review">v{pending.version} pending</Badge> : null}</div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{eff?.summary}</p>
                <p className="text-xs text-muted-foreground">{eff?.citation} · verified {eff?.verifiedOn} · params {JSON.stringify(eff?.params ?? {})}</p>
                {eff?.sourceExcerpt ? <blockquote className="border-l-2 border-teal pl-3 text-xs italic text-muted-foreground">{eff.sourceExcerpt}</blockquote> : null}
                {pending ? (
                  <div className="rounded-md border border-review/40 bg-review-bg p-3">
                    <div className="text-xs font-semibold">Pending v{pending.version}: {pending.changeNote}</div>
                    <p className="mt-1">{pending.summary}</p>
                    <p className="text-xs text-muted-foreground">params {JSON.stringify(pending.params)} · proposed {formatDateTime(pending.createdAt)}</p>
                    <div className="mt-2 flex gap-2"><SimpleActionButton action={reviewRuleAction} args={{ versionId: pending.id, decision: "approve" }} size="sm" success="Approved — now effective">Approve</SimpleActionButton><SimpleActionButton action={reviewRuleAction} args={{ versionId: pending.id, decision: "reject" }} size="sm" variant="outline" success="Rejected">Reject</SimpleActionButton></div>
                  </div>
                ) : (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-blue">Propose a new version</summary>
                    <ActionForm action={proposeRuleAction} extra={{ ruleKey: rule.ruleKey }} success="Proposed — awaiting review" className="mt-2 space-y-2">
                      <Field label="Summary" htmlFor={`s-${rule.id}`}><Textarea id={`s-${rule.id}`} name="summary" rows={3} defaultValue={eff?.summary} /></Field>
                      <Field label="Parameters (JSON)" htmlFor={`p-${rule.id}`}><Input id={`p-${rule.id}`} name="params" defaultValue={JSON.stringify(eff?.params ?? {})} /></Field>
                      <Field label="Change note & source verification" htmlFor={`c-${rule.id}`}><Input id={`c-${rule.id}`} name="changeNote" required /></Field>
                      <SubmitButton size="sm">Submit for review</SubmitButton>
                    </ActionForm>
                  </details>
                )}
                {versions.length > 1 ? <p className="text-xs text-muted-foreground">History: {versions.map((v) => `v${v.version} ${v.reviewStatus}`).join(" · ")}</p> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
