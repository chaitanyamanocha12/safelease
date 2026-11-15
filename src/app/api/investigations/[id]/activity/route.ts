import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireApiUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { db } from "@/server/db/client";
import { agentRun, toolRun } from "@/server/db/schema";
import { getInvestigationForUser } from "@/server/services/investigations";

export const dynamic = "force-dynamic";

/** Polled by the agent activity panel while a run is in progress. */
export async function GET(_req: Request, ctx: RouteContext<"/api/investigations/[id]/activity">) {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    await getInvestigationForUser(user.id, id);
    const [run] = await db.select().from(agentRun).where(eq(agentRun.investigationId, id)).orderBy(desc(agentRun.startedAt)).limit(1);
    const tools = run ? await db.select().from(toolRun).where(eq(toolRun.agentRunId, run.id)).orderBy(toolRun.startedAt) : [];
    return NextResponse.json(
      {
        run: run ? { id: run.id, status: run.status, plannerMode: run.plannerMode, plannerNote: run.plannerNote, iterations: run.iterations, toolCalls: run.toolCalls, maxToolCalls: run.maxToolCalls, summary: run.summary, startedAt: run.startedAt, finishedAt: run.finishedAt } : null,
        tools: tools.map((t) => ({ id: t.id, tool: t.tool, status: t.status, mode: t.mode, reason: t.reason, summary: (t.output as { summary?: string } | null)?.summary ?? t.error, iteration: t.iteration, durationMs: t.durationMs })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    return NextResponse.json({ error: err instanceof AppError ? err.message : "Unexpected error" }, { status });
  }
}
