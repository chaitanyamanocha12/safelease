import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { listNotifications } from "@/server/services/notifications";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { SimpleActionButton } from "@/components/forms/simple-action-button";
import { markReadAction } from "@/server/actions/account";
import { relativeTime, titleCase } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id, { limit: 100 });
  return (
    <>
      <PageHeader title="Notifications" description="In-app notifications. Email notifications are sent only if an email provider is configured and enabled in Settings." actions={<SimpleActionButton action={markReadAction} args={{}} variant="outline">Mark all read</SimpleActionButton>} />
      {items.length === 0 ? <EmptyState icon={<Bell />} title="No notifications" /> : null}
      <div className="space-y-2">
        {items.map((n) => (
          <Card key={n.id} className={n.readAt ? "opacity-75" : "border-l-4 border-l-teal-strong"}>
            <div className="flex flex-wrap items-start justify-between gap-2 p-4">
              <div>
                <div className="flex items-center gap-2"><span className={n.readAt ? "" : "font-semibold"}>{n.title}</span><Badge tone="outline">{titleCase(n.category)}</Badge></div>
                <p className="text-sm text-muted-foreground">{n.body}</p>
                <p className="text-xs text-muted-foreground">{relativeTime(n.createdAt)}</p>
              </div>
              <div className="flex gap-1">
                {n.link ? <Link href={n.link} className="text-sm text-blue hover:underline">Open</Link> : null}
                {!n.readAt ? <SimpleActionButton action={markReadAction} args={{ id: n.id }} variant="ghost" size="sm">Mark read</SimpleActionButton> : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
