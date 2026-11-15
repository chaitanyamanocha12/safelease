"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Callout } from "@/components/ui/misc";
import { inviteAction } from "@/server/actions/organization";

export function InviteForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [res, setRes] = useState<{ link: string; emailOutcome: string } | null>(null);
  return (
    <div className="space-y-3">
      <form className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const r = await inviteAction({ orgId, email: fd.get("email"), role: fd.get("role") }); if (!r.ok) return toast.error(r.error); setRes(r.data); router.refresh(); }}>
        <Field label="Email" htmlFor="ie"><Input id="ie" name="email" type="email" required /></Field>
        <Field label="Role" htmlFor="ir"><Select id="ir" name="role" defaultValue="adviser"><option value="adviser">Adviser</option><option value="org_admin">Org admin</option><option value="member">Member</option></Select></Field>
        <Button type="submit">Invite</Button>
      </form>
      {res ? (
        <Callout tone={res.emailOutcome === "submitted" ? "ok" : "warn"} title={res.emailOutcome === "submitted" ? "Invitation email accepted by the provider" : "Invitation created — email not delivered"}>
          Share this one-time link securely: <code className="break-all text-xs">{res.link}</code>
        </Callout>
      ) : null}
    </div>
  );
}
