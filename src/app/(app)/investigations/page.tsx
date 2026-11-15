import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical, Plus, Search } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { listInvestigations } from "@/server/services/investigations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Callout, EmptyState, PageHeader } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { caseReference } from "@/lib/ids";

export const metadata: Metadata = { title: "Investigations" };

const STATUS_LABEL = { draft: "Draft", active: "Active", awaiting_info: "Awaiting info", closed: "Closed" } as const;

export default async function InvestigationsPage({ searchParams }: { searchParams: Promise<{ page?: string; deleted?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Number(sp.page ?? 1) || 1;
  const { items, total, pageSize } = await listInvestigations(user.id, { page });
  return (
    <>
      <PageHeader
        title="Investigations"
        description="Each investigation keeps its evidence, extracted statements, findings and history together."
        actions={
          <Button asChild variant="teal">
            <Link href="/investigations/new"><Plus /> New investigation</Link>
          </Button>
        }
      />
      {sp.deleted ? <Callout tone="ok" className="mb-4">Investigation permanently deleted.</Callout> : null}
      {items.length === 0 ? (
        <EmptyState icon={<Search />} title="No investigations yet" description="Start by pasting a listing, uploading a screenshot or adding a landlord message." action={<Button asChild><Link href="/investigations/new">Investigate a rental</Link></Button>} />
      ) : (
        <div className="grid gap-3">
          {items.map((i) => (
            <Card key={i.id} className="transition-shadow hover:shadow-md">
              <Link href={`/investigations/${i.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-medium">{i.title}</h2>
                    <Badge tone="outline">{STATUS_LABEL[i.status]}</Badge>
                    {i.isDemo ? <Badge tone="demo"><FlaskConical /> DEMO</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{caseReference(i.id)} · {i.city ?? "Location not set"} · updated {relativeTime(i.updatedAt)}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {i.serious > 0 ? <Badge tone="bad">{i.serious} serious</Badge> : null}
                  {i.caution > 0 ? <Badge tone="warn">{i.caution} to clarify</Badge> : null}
                  {i.serious === 0 && i.caution === 0 ? <Badge tone="neutral">No warnings yet · still unverified</Badge> : null}
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
      {total > pageSize ? (
        <nav aria-label="Pagination" className="mt-4 flex justify-between text-sm">
          {page > 1 ? <Link href={`?page=${page - 1}`} className="text-blue">← Previous</Link> : <span />}
          {page * pageSize < total ? <Link href={`?page=${page + 1}`} className="text-blue">Next →</Link> : null}
        </nav>
      ) : null}
    </>
  );
}
