import type { Metadata } from "next";
import Link from "next/link";
import { Download, Lock } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { listMyConsents, myMemberships } from "@/server/services/organizations";
import { getProfile } from "@/server/services/profile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, PageHeader } from "@/components/ui/misc";
import { SimpleActionButton } from "@/components/forms/simple-action-button";
import { DeleteAccountForm, RetentionForm } from "@/components/forms/settings-forms";
import { revokeShareAction } from "@/server/actions/verification";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Privacy & data" };

export default async function PrivacySettings() {
  const user = await requireUser();
  const [consents, mems, p] = await Promise.all([listMyConsents(user.id), myMemberships(user.id), getProfile(user.id)]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Privacy & data" />
      <Callout tone="ok" icon={<Lock />}>Your cases are private. Organization membership never gives anyone access to them — only the specific sharing grants below do.</Callout>
      <Card>
        <CardHeader><CardTitle>Case sharing</CardTitle><CardDescription>Revoking takes effect immediately.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {consents.length === 0 ? <p className="text-sm text-muted-foreground">You haven't shared any cases.</p> : null}
          {consents.map((c) => (
            <div key={c.grant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
              <div><div className="font-medium">{c.investigationTitle ?? "Case"} → {c.orgName}</div><div className="text-xs text-muted-foreground">{c.grant.scope} · shared {formatDateTime(c.grant.grantedAt)}{c.grant.revokedAt ? ` · revoked ${formatDateTime(c.grant.revokedAt)}` : ""}</div></div>
              <div className="flex items-center gap-2"><Badge tone={c.grant.status === "active" ? "teal" : "outline"}>{c.grant.status}</Badge>{c.grant.status === "active" ? <SimpleActionButton action={revokeShareAction} args={{ grantId: c.grant.id }} size="sm" variant="outline" success="Sharing revoked">Revoke</SimpleActionButton> : null}</div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Organization memberships</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">{mems.length === 0 ? <p className="text-muted-foreground">None.</p> : mems.map((m) => <div key={m.membership.id}>{m.org.name} · <Badge tone="outline">{m.membership.role.replace("_", " ")}</Badge></div>)}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Your data</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Button asChild variant="outline"><Link href="/api/account/export"><Download /> Export all my data (JSON)</Link></Button>
          <RetentionForm days={p?.retentionDays ?? null} />
        </CardContent>
      </Card>
      <Card className="border-bad/40">
        <CardHeader><CardTitle className="text-bad">Delete account</CardTitle><CardDescription>Removes your account, cases, documents and stored files. This cannot be undone.</CardDescription></CardHeader>
        <CardContent><DeleteAccountForm email={user.email} /></CardContent>
      </Card>
    </div>
  );
}
