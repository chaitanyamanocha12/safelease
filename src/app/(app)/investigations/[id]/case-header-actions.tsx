"use client";
import Link from "next/link";
import { FileDown, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/controls";
import { deleteInvestigationAction, updateInvestigationAction } from "../actions";

export function CaseHeaderActions({ id, status }: { id: string; status: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={`/api/reports/investigation/${id}?format=pdf`}><FileDown /> Report (PDF)</a>
      </Button>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More case actions"><MoreHorizontal /></Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem asChild><a href={`/api/reports/investigation/${id}?format=json`}>Export JSON</a></DropdownItem>
          <DropdownItem asChild><a href={`/api/reports/investigation/${id}?format=csv`}>Export findings (CSV)</a></DropdownItem>
          <DropdownItem asChild><a href={`/api/reports/prepayment/${id}?format=pdf`}>Before-you-pay report</a></DropdownItem>
          <DropdownItem asChild><a href={`/api/reports/verification/${id}?format=pdf`}>Verification checklist</a></DropdownItem>
          <DropdownSeparator />
          {status !== "closed" ? (
            <DropdownItem onSelect={async () => { const r = await updateInvestigationAction({ investigationId: id, status: "closed" }); if (!r.ok) toast.error(r.error); else toast.success("Case closed."); }}>Close case</DropdownItem>
          ) : (
            <DropdownItem onSelect={async () => { const r = await updateInvestigationAction({ investigationId: id, status: "active" }); if (!r.ok) toast.error(r.error); }}>Reopen case</DropdownItem>
          )}
          <DropdownItem asChild><Link href={`/investigations/${id}/verification#share`}>Share with an adviser…</Link></DropdownItem>
        </DropdownContent>
      </Dropdown>
      <ConfirmDialog
        trigger={<Button variant="ghost" size="icon" aria-label="Delete investigation"><Trash2 /></Button>}
        title="Delete this investigation permanently?"
        description="This removes the case, its evidence records, findings and history. Uploaded files remain in your Document vault until you delete them there. This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() => deleteInvestigationAction(id)}
      />
    </div>
  );
}
