"use client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { memberUpdateAction, revokeInviteAction } from "@/server/actions/organization";

export function MemberControls({ orgId, membershipId, role }: { orgId: string; membershipId: string; role: string }) {
  const router = useRouter();
  const run = async (p: { role?: "org_admin" | "adviser" | "member"; status?: "removed" }) => { const r = await memberUpdateAction({ orgId, membershipId, ...p }); if (!r.ok) toast.error(r.error); else router.refresh(); };
  return (
    <div className="flex items-center gap-2">
      <Select aria-label="Role" className="h-8 w-36" defaultValue={role} onChange={(e) => run({ role: e.target.value as "org_admin" })}><option value="org_admin">Org admin</option><option value="adviser">Adviser</option><option value="member">Member</option></Select>
      <Button size="sm" variant="ghost" onClick={() => run({ status: "removed" })}>Remove</Button>
    </div>
  );
}
export function RevokeInvite({ orgId, invitationId }: { orgId: string; invitationId: string }) {
  const router = useRouter();
  return <Button size="sm" variant="ghost" onClick={async () => { const r = await revokeInviteAction({ orgId, invitationId }); if (!r.ok) toast.error(r.error); else router.refresh(); }}>Revoke</Button>;
}
export function InviteResult() { return null; }
