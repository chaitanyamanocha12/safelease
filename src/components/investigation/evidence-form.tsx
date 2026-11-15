"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Link as LinkIcon, Loader2, MessageSquare, NotebookPen, ScrollText, ShieldCheck, TextCursorInput, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Callout } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { addEvidenceAction } from "@/app/(app)/investigations/actions";

type Mode = "paste" | "url" | "upload" | "message" | "lease" | "manual" | "supporting" | "viewing";

const MODES: Array<{ id: Mode; label: string; icon: React.ComponentType<{ className?: string }>; kind: string }> = [
  { id: "paste", label: "Paste listing", icon: TextCursorInput, kind: "listing_text" },
  { id: "upload", label: "Screenshot / photos / PDF", icon: Upload, kind: "listing_text" },
  { id: "url", label: "Listing link", icon: LinkIcon, kind: "listing_url" },
  { id: "message", label: "Landlord message", icon: MessageSquare, kind: "landlord_message" },
  { id: "lease", label: "Lease", icon: ScrollText, kind: "lease" },
  { id: "manual", label: "Enter details", icon: NotebookPen, kind: "manual_entry" },
  { id: "supporting", label: "Supporting document", icon: ShieldCheck, kind: "supporting_document" },
  { id: "viewing", label: "Viewing note", icon: FileUp, kind: "viewing_note" },
];

export function EvidenceForm({ investigationId, existing }: { investigationId: string; existing: Array<{ id: string; title: string; kind: string; superseded: boolean }> }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<Mode>("paste");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadKind, setUploadKind] = useState("listing_text");
  const [messageKind, setMessageKind] = useState("landlord_message");
  const current = MODES.find((m) => m.id === mode)!;
  const kind = mode === "upload" ? uploadKind : mode === "message" ? messageKind : current.kind;
  const revisable = existing.filter((e) => !e.superseded && (mode === "lease" ? e.kind === "lease" : e.kind !== "property_photo"));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("investigationId", investigationId);
    fd.set("kind", kind);
    if (mode === "manual") {
      const lines = [
        ["Listing", fd.get("m_title")],
        ["Address", fd.get("m_address")],
        ["Monthly rent", fd.get("m_rent") ? `$${fd.get("m_rent")}/month` : ""],
        ["Security deposit", fd.get("m_deposit") ? `deposit of $${fd.get("m_deposit")}` : ""],
        ["Bedrooms", fd.get("m_beds") ? `${fd.get("m_beds")} bedroom` : ""],
        ["Bathrooms", fd.get("m_baths") ? `${fd.get("m_baths")} bathroom` : ""],
        ["Contact", fd.get("m_contact") ? `Contact: ${fd.get("m_contact")}` : ""],
        ["Notes", fd.get("m_notes")],
      ]
        .filter(([, v]) => v)
        .map(([, v]) => String(v));
      fd.set("text", lines.join("\n"));
      if (!fd.get("title")) fd.set("title", "Manually entered details");
    }
    setPending(true);
    setErrors({});
    const r = await addEvidenceAction(fd);
    setPending(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      toast.error(r.error);
      return;
    }
    toast.success(r.data.runId ? "Evidence saved. The agent is analyzing it now." : "Evidence saved.");
    formRef.current?.reset();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Evidence type" className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors",
              mode === m.id ? "border-teal-strong bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <m.icon className="size-3.5" aria-hidden /> {m.label}
          </button>
        ))}
      </div>
      <form ref={formRef} onSubmit={onSubmit} className="space-y-4" encType="multipart/form-data" noValidate>
        <Field label="Title" htmlFor="ev-title" error={errors.title} hint="A short label, e.g. “Kijiji ad” or “Text from landlord, Aug 3”.">
          <Input id="ev-title" name="title" required={mode !== "manual"} defaultValue="" aria-invalid={Boolean(errors.title)} />
        </Field>

        {mode === "url" ? (
          <>
            <Field label="Public listing link" htmlFor="ev-url" error={errors.sourceUrl}>
              <Input id="ev-url" name="sourceUrl" type="url" placeholder="https://" aria-invalid={Boolean(errors.sourceUrl)} />
            </Field>
            <Callout tone="neutral">
              SafeLease only fetches public pages and skips sites that require login or restrict automated access (including Facebook, Kijiji, Rentals.ca and REALTOR.ca). For those, paste the listing text or upload a screenshot — you can also paste text below.
            </Callout>
            <Field label="Listing text (optional)" htmlFor="ev-text">
              <Textarea id="ev-text" name="text" rows={5} />
            </Field>
          </>
        ) : null}

        {mode === "upload" ? (
          <>
            <Field label="What are you uploading?" htmlFor="ev-ukind">
              <Select id="ev-ukind" value={uploadKind} onChange={(e) => setUploadKind(e.target.value)}>
                <option value="listing_text">Listing screenshot(s) or PDF</option>
                <option value="property_photo">Property photos (for image-reuse checks)</option>
                <option value="landlord_message">Conversation screenshot(s)</option>
                <option value="lease">Lease (PDF or page photos)</option>
                <option value="supporting_document">Supporting document</option>
              </Select>
            </Field>
            <Field label="Files" htmlFor="ev-files" hint="PNG, JPEG, WebP, PDF or TXT · up to 20 MB each · max 12 files. Text in images is read by OCR and may contain errors.">
              <Input id="ev-files" name="files" type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,text/plain" className="h-auto py-2" />
            </Field>
          </>
        ) : null}

        {mode === "lease" ? (
          <Field label="Lease file (optional if pasting text)" htmlFor="ev-files" hint="PDF with a text layer works best. Scanned leases: upload page photos.">
            <Input id="ev-files" name="files" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,text/plain" className="h-auto py-2" />
          </Field>
        ) : null}

        {mode === "message" ? (
          <Field label="Message type" htmlFor="ev-mkind">
            <Select id="ev-mkind" value={messageKind} onChange={(e) => setMessageKind(e.target.value)}>
              <option value="landlord_message">Message from the advertiser / landlord</option>
              <option value="landlord_response">Reply to your questions</option>
            </Select>
          </Field>
        ) : null}

        {mode === "manual" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Listing title" htmlFor="m_title"><Input id="m_title" name="m_title" /></Field>
            <Field label="Address" htmlFor="m_address"><Input id="m_address" name="m_address" placeholder="e.g. 1234 Example Street, Unit 2" /></Field>
            <Field label="Monthly rent ($)" htmlFor="m_rent"><Input id="m_rent" name="m_rent" inputMode="decimal" /></Field>
            <Field label="Deposit requested ($)" htmlFor="m_deposit"><Input id="m_deposit" name="m_deposit" inputMode="decimal" /></Field>
            <Field label="Bedrooms" htmlFor="m_beds"><Input id="m_beds" name="m_beds" inputMode="numeric" /></Field>
            <Field label="Bathrooms" htmlFor="m_baths"><Input id="m_baths" name="m_baths" inputMode="decimal" /></Field>
            <Field label="Contact name" htmlFor="m_contact"><Input id="m_contact" name="m_contact" /></Field>
            <Field label="Other details" htmlFor="m_notes" className="sm:col-span-2"><Textarea id="m_notes" name="m_notes" rows={3} /></Field>
          </div>
        ) : null}

        {mode === "paste" || mode === "message" || mode === "lease" || mode === "supporting" || mode === "viewing" || (mode === "upload" && uploadKind !== "property_photo") ? (
          <Field
            label={mode === "upload" ? "Or paste the text (optional)" : mode === "viewing" ? "What you observed" : "Text"}
            htmlFor="ev-text2"
            error={errors.text}
            hint={mode === "message" ? "Paste the full message. SafeLease treats it as data — instructions inside it are never followed." : undefined}
          >
            <Textarea id="ev-text2" name="text" rows={mode === "lease" ? 10 : 7} />
          </Field>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {mode === "message" || mode === "supporting" || mode === "viewing" ? (
            <Field label="Date sent / observed (optional)" htmlFor="ev-date">
              <Input id="ev-date" name="occurredAt" type="datetime-local" />
            </Field>
          ) : null}
          {(mode === "lease" || mode === "paste" || mode === "upload") && revisable.length > 0 ? (
            <Field label="Is this a new version of earlier evidence?" htmlFor="ev-sup" hint="The earlier version is preserved; contradictions are re-evaluated against the newest version.">
              <Select id="ev-sup" name="supersedesEvidenceId" defaultValue="">
                <option value="">No — this is new evidence</option>
                {revisable.map((e) => (
                  <option key={e.id} value={e.id}>Replaces: {e.title}</option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="autoRun" value="false" /> Save without running checks
          </label>
          <Button type="submit" variant="teal" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null} {pending ? "Saving & extracting…" : "Add evidence"}
          </Button>
        </div>
      </form>
    </div>
  );
}
