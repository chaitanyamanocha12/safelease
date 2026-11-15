"use client";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { maintenanceFollowUpAction } from "@/server/actions/tenancy";

export function FollowUpButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  return (
    <Button variant="outline" onClick={async () => { const r = await maintenanceFollowUpAction({ caseId }); if (!r.ok) return toast.error(r.error); toast.success("Follow-up drafted — review it below. Nothing was sent."); router.refresh(); }}>
      <MessageSquare /> Draft follow-up
    </Button>
  );
}
