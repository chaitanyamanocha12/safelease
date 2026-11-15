import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { listLeaseReviews } from "@/server/services/leases";
import { db } from "@/server/db/client";
import { investigation } from "@/server/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout, EmptyState, PageHeader } from "@/components/ui/misc";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { createLeaseReviewAction } from "@/server/actions/tenancy";
import { relativeTime } from "@/lib/utils";
import { LEGAL_DISCLAIMER } from "@/server/legal/catalog";

export const metadata: Metadata = { title: "Lease review" };

export default async function LeaseReviewPage() {
  const user = await requireUser();
  const [items, invs] = await Promise.all([listLeaseReviews(user.id), db.select({ id: investigation.id, title: investigation.title }).from(investigation).where(eq(investigation.ownerId, user.id))]);
  return (
    <>
      <PageHeader title="Lease review" description="Clause-by-clause analysis against verified Nova Scotia rules, with page references and plain-language explanations." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-3">
          {items.length === 0 ? <EmptyState icon={<FileText />} title="No leases reviewed yet" description="Upload a PDF, page photos, or paste the text." /> : null}
          {items.map((l) => (
            <Card key={l.id}>
              <Link href={`/lease-review/${l.id}`} className="flex items-center justify-between gap-2 p-4">
                <div>
                  <div className="font-medium">{l.title}</div>
                  <div className="text-xs text-muted-foreground">Updated {relativeTime(l.updatedAt)}{l.investigationId ? " · linked to an investigation" : ""}</div>
                </div>
                {l.isDemo ? <Badge tone="demo">DEMO</Badge> : null}
              </Link>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground">{LEGAL_DISCLAIMER}</p>
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Review a lease</CardTitle>
            <CardDescription>PDFs with a text layer give page references. Scans: upload page photos for OCR.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createLeaseReviewAction} mode="formdata" success="Lease analyzed" redirectTo="/lease-review/{id}" className="space-y-3">
              <Field label="Title" htmlFor="lt"><Input id="lt" name="title" placeholder="e.g. Harbourview Lane lease" /></Field>
              <Field label="Link to an investigation (optional)" htmlFor="li" hint="Adds the lease to that case so it's compared with the listing."><Select id="li" name="investigationId" defaultValue=""><option value="">None</option>{invs.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</Select></Field>
              <Field label="Lease file" htmlFor="lf"><Input id="lf" name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,text/plain" className="h-auto py-2" /></Field>
              <Field label="Or paste the lease text" htmlFor="ltext"><Textarea id="ltext" name="text" rows={6} /></Field>
              <SubmitButton variant="teal" pendingLabel="Analyzing…">Analyze lease</SubmitButton>
            </ActionForm>
            <Callout tone="neutral" className="mt-4">Missing terms are reported as missing — SafeLease never fills them in. Interpretations marked “unverified” need human review.</Callout>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
