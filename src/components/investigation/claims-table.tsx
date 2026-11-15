"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/misc";
import { EvidenceStatusBadge } from "@/components/status/status-badge";
import { titleCase } from "@/lib/utils";
import { correctClaimAction } from "@/app/(app)/investigations/actions";

export interface ClaimView {
  id: string;
  claimType: string;
  value: string;
  excerpt: string | null;
  locator: string | null;
  extractor: string;
  extractionConfidence: string | null;
  status: string;
  supersededAt: Date | string | null;
  evidenceTitle: string;
  evidenceSuperseded: boolean;
}

const HIDDEN = new Set(["listing_title"]);

function CorrectDialog({ c }: { c: ClaimView }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(c.value);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Correct ${titleCase(c.claimType)}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent title={`Correct “${titleCase(c.claimType)}”`} description="Your correction is saved as a new statement. The original extraction stays in the history.">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await correctClaimAction({ claimId: c.id, value, note: note || undefined });
            setBusy(false);
            if (!r.ok) return toast.error(r.fieldErrors ? Object.values(r.fieldErrors)[0]! : r.error);
            toast.success("Correction saved. Checks are re-running.");
            setOpen(false);
          }}
        >
          <Field label="Corrected value" htmlFor={`cv-${c.id}`}>
            <Input id={`cv-${c.id}`} value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Note (optional)" htmlFor={`cn-${c.id}`}>
            <Input id={`cn-${c.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. OCR misread the amount" />
          </Field>
          {c.excerpt ? <p className="rounded-md bg-muted p-2 text-xs italic text-muted-foreground">Source: {c.excerpt}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>Save correction</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClaimsTable({ claims, readOnly, showHistory }: { claims: ClaimView[]; readOnly?: boolean; showHistory?: boolean }) {
  const rows = claims.filter((c) => !HIDDEN.has(c.claimType) && (showHistory || (!c.supersededAt && !c.evidenceSuperseded)));
  return (
    <Table>
      <caption className="sr-only">Statements extracted from evidence</caption>
      <thead>
        <tr>
          <Th>Field</Th>
          <Th>Stated value</Th>
          <Th>Source</Th>
          <Th>Status</Th>
          {!readOnly ? <Th className="w-10"><span className="sr-only">Actions</span></Th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} className={c.supersededAt || c.evidenceSuperseded ? "opacity-60" : undefined}>
            <Td className="whitespace-nowrap font-medium">{titleCase(c.claimType)}</Td>
            <Td>
              <div>{c.value}</div>
              {c.excerpt ? <div className="mt-0.5 line-clamp-2 text-xs italic text-muted-foreground">“{c.excerpt}”</div> : null}
            </Td>
            <Td className="text-xs">
              <div>{c.evidenceTitle}</div>
              <div className="text-muted-foreground">{c.locator}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge tone={c.extractor === "user" ? "teal" : c.extractor === "llm" ? "review" : "outline"}>{c.extractor === "user" ? "Your correction" : c.extractor === "llm" ? "AI-extracted" : "Rule-extracted"}</Badge>
                {c.supersededAt ? <Badge tone="outline">Superseded</Badge> : null}
                {c.evidenceSuperseded ? <Badge tone="outline">Older version</Badge> : null}
              </div>
            </Td>
            <Td><EvidenceStatusBadge status={c.status} /></Td>
            {!readOnly ? <Td>{!c.supersededAt && !c.evidenceSuperseded ? <CorrectDialog c={c} /> : null}</Td> : null}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
