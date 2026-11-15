"use client";
import { useRouter } from "next/navigation";
import { Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteInspectionItemAction, itemToMaintenanceAction } from "@/server/actions/tenancy";

export function InspectionItemActions({ itemId, inspectionId, tenancyId, title, description, room }: { itemId: string; inspectionId: string; tenancyId: string; title: string; description: string; room: string }) {
  const router = useRouter();
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={async () => { const r = await itemToMaintenanceAction({ itemId, tenancyId, title, description, room }); if (!r.ok) return toast.error(r.error); toast.success("Maintenance case created"); router.push(`/maintenance/${r.data.id}`); }}><Wrench /> Repair request</Button>
      <Button size="icon" variant="ghost" aria-label="Delete item" onClick={async () => { const r = await deleteInspectionItemAction({ itemId, inspectionId }); if (!r.ok) toast.error(r.error); else router.refresh(); }}><Trash2 /></Button>
    </div>
  );
}
