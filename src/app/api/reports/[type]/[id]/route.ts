import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";
import { audit } from "@/server/services/audit";
import * as R from "@/server/reports/builders";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/api/reports/[type]/[id]">) {
  try {
    const user = await requireApiUser();
    await rateLimit(`report:${user.id}`, 30, 60_000);
    const { type, id } = await ctx.params;
    const format = new URL(req.url).searchParams.get("format") ?? "pdf";
    let out: R.ReportOutput;
    switch (type) {
      case "investigation": out = await R.investigationReport(user.id, id, format); break;
      case "verification": out = await R.verificationReport(user.id, id); break;
      case "prepayment": out = await R.prepaymentReport(user.id, id); break;
      case "correspondence": out = await R.correspondenceReport(user.id, id, format); break;
      case "lease": out = await R.leaseReport(user.id, id); break;
      case "comparison": out = await R.comparisonReport(user.id); break;
      case "listing": out = await R.listingExport(user.id, id); break;
      case "inspection": out = await R.inspectionReport(user.id, id); break;
      case "maintenance": out = await R.maintenanceReport(user.id, id); break;
      case "deposit": out = await R.depositReport(user.id, id); break;
      case "dispute": out = await R.disputeReport(user.id, id, format); break;
      case "organization": out = await R.organizationReport(user.id, id, format); break;
      default: throw new AppError("NOT_FOUND", "Unknown report type.");
    }
    await audit({ actorId: user.id, action: "report.generate", resourceType: type, resourceId: id, metadata: { format } });
    const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    if (out.pdf) return new NextResponse(new Uint8Array(out.pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.filename}"` } });
    if (out.csv !== undefined) return new NextResponse(out.csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${out.filename}"` } });
    return new NextResponse(JSON.stringify(out.json, null, 2), { headers: { ...headers, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${out.filename}"` } });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[safelease] report error", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Report could not be generated." }, { status: 500 });
  }
}
