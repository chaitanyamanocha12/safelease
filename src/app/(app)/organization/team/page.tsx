import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { orgContext } from "@/server/services/org-context";
import { listMembers } from "@/server/services/organizations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { OrgNav } from "@/components/shell/org-nav";
import { InviteForm } from "@/components/forms/invite-form";
import { MemberControls, RevokeInvite } from "@/components/forms/member-controls";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const sp = await searchParams;
  const { user, mems, current } = await orgContext(sp.org);
  if (!current || current.membership.role !== "org_admin") redirect("/organization");
  const { members, invites } = await listMembers(user.id, current.org.id);
  return (
    <>
      <PageHeader title={current.org.name} description="Manage who can review shared cases." />
      <OrgNav orgId={current.org.id} active="/team" isAdmin orgs={mems.map((m) => m.org)} />
      <div className="space-y-6">
        <Card><CardHeader><CardTitle>Invite</CardTitle></CardHeader><CardContent><InviteForm orgId={current.org.id} /></CardContent></Card>
        <Card>
          <CardHeader><CardTitle>Members</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <thead><tr><Th>Name</Th><Th>Email</Th><Th>Status</Th><Th>Joined</Th><Th>Role</Th></tr></thead>
              <tbody>{members.map((m) => <tr key={m.id}><Td>{m.name}</Td><Td>{m.email}</Td><Td><Badge tone={m.status === "active" ? "ok" : "outline"}>{m.status}</Badge></Td><Td>{formatDate(m.createdAt)}</Td><Td>{m.status === "active" ? <MemberControls orgId={current.org.id} membershipId={m.id} role={m.role} /> : m.role}</Td></tr>)}</tbody>
            </Table>
            <p className="p-4 text-xs text-muted-foreground">Members with the “member” role have no access to shared cases. Advisers see only cases explicitly shared with this organization.</p>
          </CardContent>
        </Card>
        {invites.length ? <Card><CardHeader><CardTitle>Pending invitations</CardTitle></CardHeader><CardContent className="space-y-2">{invites.map((i) => <div key={i.id} className="flex items-center justify-between text-sm"><span>{i.email} · {i.role} · expires {formatDate(i.expiresAt)}</span><RevokeInvite orgId={current.org.id} invitationId={i.id} /></div>)}</CardContent></Card> : null}
      </div>
    </>
  );
}
