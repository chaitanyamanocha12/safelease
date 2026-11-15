import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { getDocumentWithVersions } from "@/server/services/documents";

export const dynamic = "force-dynamic";

/** Redirects to the latest version of an owned document (authorization checked here and at the version route). */
export async function GET(req: Request, ctx: RouteContext<"/api/files/doc/[documentId]">) {
  try {
    const user = await requireApiUser();
    const { documentId } = await ctx.params;
    const { versions } = await getDocumentWithVersions(user.id, documentId);
    const latest = versions[0];
    if (!latest) throw new AppError("NOT_FOUND", "File not found.");
    const url = new URL(`/api/files/${latest.id}`, req.url);
    url.search = new URL(req.url).search;
    return NextResponse.redirect(url, 307);
  } catch (err) {
    return NextResponse.json({ error: err instanceof AppError ? err.message : "File unavailable" }, { status: err instanceof AppError ? err.status : 500 });
  }
}
