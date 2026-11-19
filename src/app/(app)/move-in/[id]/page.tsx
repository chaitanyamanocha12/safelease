import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { FileDown } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { compareInspections, getInspection } from "@/server/services/tenancy";
import { db } from "@/server/db/client";
import { inspection, inspectionItem, ROOMS } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { formatDate, titleCase } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, Table, Td, Th } from "@/components/ui/misc";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ActionForm } from "@/components/forms/action-form";
import { InspectionItemActions } from "@/components/forms/inspection-item-actions";
import { addInspectionItemAction, updateInspectionAction } from "@/server/actions/tenancy";

const COND_TONE: Record<string, "ok" | "info" | "warn" | "bad" | "neutral"> = { good: "ok", fair: "info", poor: "warn", damaged: "bad", missing: "bad", not_working: "bad", not_applicable: "neutral" };

export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let d;
  try {
    d = await getInspection(user.id, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { inspection: i, tenancy: t, items, images } = d;
  let comparison: ReturnType<typeof compareInspections> | null = null;
  if (i.kind === "move_out") {
    const [mi] = await db.select().from(inspection).where(and(eq(inspection.tenancyId, t.id), eq(inspection.kind, "move_in")));
    if (mi) comparison = compareInspections(await db.select().from(inspectionItem).where(eq(inspectionItem.inspectionId, mi.id)), items);
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex gap-1.5">{t.isDemo ? <Badge tone="demo">DEMO</Badge> : null}<Badge tone={i.status === "completed" ? "ok" : "info"}>{i.status}</Badge></div>
          <h1 className="text-2xl font-semibold tracking-tight">{i.kind === "move_in" ? "Move-in" : "Move-out"} inspection — {t.label}</h1>
          <p className="text-sm text-muted-foreground">{formatDate(i.inspectedOn)} · {items.length} item(s) · {items.filter((x) => x.preExisting).length} pre-existing issue(s)</p>
        </div>
        <Button asChild variant="outline"><a href={`/api/reports/inspection/${i.id}?format=pdf`}><FileDown /> Inspection report (PDF)</a></Button>
      </div>
      <Callout tone="neutral">This report organizes what you recorded. It is not the official signed Rental Unit Condition Report and SafeLease never adds damage you didn't record.</Callout>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {comparison ? (
            <Card>
              <CardHeader><CardTitle>Move-in vs move-out</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <thead><tr><Th>Room</Th><Th>Item</Th><Th>Move-in</Th><Th>Move-out</Th><Th>Change</Th></tr></thead>
                  <tbody>{comparison.map((r, k) => <tr key={k}><Td>{titleCase(r.room)}</Td><Td>{r.itemName}{r.preExisting ? <Badge tone="outline" className="ml-1">pre-existing</Badge> : null}</Td><Td>{r.moveIn ?? "—"}</Td><Td>{r.moveOut ?? "—"}</Td><Td><Badge tone={r.change === "worse" ? "warn" : r.change === "unchanged" ? "ok" : "neutral"}>{r.change.replace(/_/g, " ")}</Badge></Td></tr>)}</tbody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
          {ROOMS.map((room) => {
            const list = items.filter((x) => x.room === room);
            if (!list.length) return null;
            return (
              <Card key={room}>
                <CardHeader><CardTitle>{titleCase(room)}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {list.map((it) => (
                    <div key={it.id} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{it.itemName}{it.roomLabel ? ` · ${it.roomLabel}` : ""}</span>
                          <Badge tone={COND_TONE[it.condition] ?? "neutral"}>{titleCase(it.condition)}</Badge>
                          {it.preExisting ? <Badge tone="warn">Pre-existing</Badge> : null}
                          {it.repairPromised ? <Badge tone="info">Repair promised{it.repairDueDate ? ` by ${formatDate(it.repairDueDate)}` : ""}</Badge> : null}
                        </div>
                        <InspectionItemActions itemId={it.id} inspectionId={i.id} tenancyId={t.id} title={`${it.itemName} (${titleCase(room)})`} description={it.description ?? `${it.itemName}: ${it.condition}`} room={titleCase(room)} />
                      </div>
                      {it.description ? <p className="mt-1 text-sm text-muted-foreground">{it.description}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {images.filter((im) => im.img.inspectionItemId === it.id).map((im) => (
                          <a key={im.img.id} href={`/api/files/doc/${im.doc.id}`} target="_blank" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/files/doc/${im.doc.id}`} alt={im.img.caption ?? it.itemName} className="h-20 w-28 rounded border border-border object-cover" loading="lazy" />
                            <span className="block text-[10px] text-muted-foreground">{im.img.caption ?? ""} · {formatDate(im.img.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
          {items.length === 0 ? <p className="text-sm text-muted-foreground">Add items room by room using the form.</p> : null}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Add an item</CardTitle><CardDescription>Photos are timestamped and stored privately.</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={addInspectionItemAction} mode="formdata" extra={{ inspectionId: i.id }} success="Item recorded" className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Room" htmlFor="ir"><Select id="ir" name="room">{ROOMS.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select></Field>
                  <Field label="Room label" htmlFor="irl"><Input id="irl" name="roomLabel" placeholder="Bedroom 2" /></Field>
                </div>
                <Field label="Item" htmlFor="ii"><Input id="ii" name="itemName" required placeholder="e.g. Stove, Window, Carpet" /></Field>
                <Field label="Condition" htmlFor="ic"><Select id="ic" name="condition" defaultValue="good">{["good", "fair", "poor", "damaged", "missing", "not_working", "not_applicable"].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select></Field>
                <Field label="Description" htmlFor="id"><Textarea id="id" name="description" rows={2} /></Field>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="preExisting" /> Pre-existing</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="repairPromised" /> Repair promised</label>
                </div>
                <Field label="Repair due (if promised)" htmlFor="idd"><Input id="idd" name="repairDueDate" type="date" /></Field>
                <Field label="Photos" htmlFor="ip"><Input id="ip" name="photos" type="file" accept="image/png,image/jpeg,image/webp" multiple className="h-auto py-2" /></Field>
                <Field label="Photo caption" htmlFor="ipc"><Input id="ipc" name="caption" /></Field>
                <SubmitButton variant="teal">Add item</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Inspection details</CardTitle></CardHeader>
            <CardContent>
              <ActionForm action={updateInspectionAction} extra={{ inspectionId: i.id }} booleans={["landlordPresent", "officialFormCompleted"]} reset={false} className="space-y-3">
                <Field label="Date" htmlFor="iod"><Input id="iod" name="inspectedOn" type="date" defaultValue={i.inspectedOn ?? ""} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="landlordPresent" defaultChecked={Boolean(i.landlordPresent)} /> Landlord was present</label>
                <Field label="Witness (if landlord absent)" htmlFor="iw"><Input id="iw" name="witnessName" defaultValue={i.witnessName ?? ""} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="officialFormCompleted" defaultChecked={i.officialFormCompleted} /> Official condition report completed and signed</label>
                <Field label="Notes" htmlFor="in"><Textarea id="in" name="notes" rows={3} defaultValue={i.notes ?? ""} /></Field>
                <Field label="Status" htmlFor="is"><Select id="is" name="status" defaultValue={i.status}><option value="draft">Draft</option><option value="completed">Completed</option></Select></Field>
                <SubmitButton>Save details</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
