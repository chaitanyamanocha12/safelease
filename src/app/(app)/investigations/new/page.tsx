import type { Metadata } from "next";
import { ArrowRight, Info } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { createInvestigationAction } from "../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Callout, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "New investigation" };

export default async function NewInvestigationPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Investigate a rental" description="Create a case, then add the listing, messages and documents. SafeLease extracts what each source says and checks it against the others." />
      <Card>
        <CardHeader>
          <CardTitle>Case details</CardTitle>
          <CardDescription>You can change these later.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createInvestigationAction} className="space-y-4">
            <Field label="Name this investigation" htmlFor="title" hint="e.g. “2BR South End — Kijiji”">
              <Input id="title" name="title" required maxLength={140} placeholder="2-bedroom apartment, South End" />
            </Field>
            <Field label="City" htmlFor="city">
              <Select id="city" name="city" defaultValue="Halifax">
                {["Halifax", "Dartmouth", "Bedford", "Sackville", "Clayton Park", "Spryfield", "Cole Harbour", "Truro", "Wolfville", "Antigonish", "Sydney"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <SubmitButton variant="teal" pendingLabel="Creating…">Continue to evidence <ArrowRight /></SubmitButton>
          </form>
        </CardContent>
      </Card>
      <Callout tone="neutral" className="mt-4" icon={<Info />}>
        SafeLease is decision support. It highlights evidence, contradictions and applicable Nova Scotia rules — it cannot certify a landlord or guarantee that a payment is safe.
      </Callout>
    </div>
  );
}
