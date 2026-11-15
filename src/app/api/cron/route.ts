import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { runDueJobs } from "@/server/services/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** External scheduler entry point. Requires `Authorization: Bearer <CRON_SECRET>`. */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Scheduler not configured (CRON_SECRET unset)." }, { status: 501 });
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok = auth.length === expected.length && crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await runDueJobs("cron_endpoint");
  return NextResponse.json({ ran: results.length, results });
}
