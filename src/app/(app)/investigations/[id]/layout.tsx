import { eq, sql } from "drizzle-orm";
import { FlaskConical } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getInvestigationForUser } from "@/server/services/investigations";
import { db } from "@/server/db/client";
import { evidence, messageDraft } from "@/server/db/schema";
import { Badge } from "@/components/ui/badge";
import { caseReference } from "@/lib/ids";
import { formatDate } from "@/lib/utils";
import { CaseTabs } from "./case-tabs";
import { CaseHeaderActions } from "./case-header-actions";
import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";

export default async function CaseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let inv;
  try {
    inv = await getInvestigationForUser(user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const [[ev], [dr]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(evidence).where(eq(evidence.investigationId, id)),
    db.select({ n: sql<number>`count(*)` }).from(messageDraft).where(eq(messageDraft.investigationId, id)),
  ]);
  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{caseReference(inv.id)}</span>
            <span>·</span>
            <span>{inv.city ?? "Nova Scotia"}</span>
            <span>·</span>
            <span>opened {formatDate(inv.createdAt)}</span>
            {inv.isDemo ? <Badge tone="demo"><FlaskConical /> DEMO case — fictional</Badge> : null}
            {inv.status === "closed" ? <Badge tone="outline">Closed</Badge> : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{inv.title}</h1>
        </div>
        <CaseHeaderActions id={inv.id} status={inv.status} />
      </div>
      <CaseTabs id={inv.id} counts={{ evidence: Number(ev?.n ?? 0), drafts: Number(dr?.n ?? 0) }} />
      {children}
    </div>
  );
}
