import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";
import { exportUserData } from "@/server/services/account";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const u = await requireApiUser();
    rateLimit(`export:${u.id}`, 5, 3600_000);
    const data = await exportUserData(u.id);
    return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="safelease-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AppError ? e.message : "Export failed" }, { status: e instanceof AppError ? e.status : 500 });
  }
}
