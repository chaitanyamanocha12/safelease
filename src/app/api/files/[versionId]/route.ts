import { NextResponse } from "next/server";
import { requireApiUser } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { readOwnedVersion } from "@/server/services/documents";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

/**
 * Authorized file access. Only the document owner can read bytes.
 * Served with nosniff, a restrictive CSP and private caching.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/files/[versionId]">) {
  let userId: string | null = null;
  try {
    const user = await requireApiUser();
    userId = user.id;
    const { versionId } = await ctx.params;
    const { bytes, version } = await readOwnedVersion(user.id, versionId);
    const download = new URL(req.url).searchParams.get("download") === "1";
    const inline = !download && (version.mimeType.startsWith("image/") || version.mimeType === "application/pdf");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": version.mimeType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${version.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.code === "NOT_FOUND" && userId) await audit({ actorId: userId, action: "file.access_denied", resourceType: "document_version", outcome: "denied" });
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "File unavailable" }, { status: 500 });
  }
}
