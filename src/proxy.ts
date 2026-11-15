/**
 * Optimistic route protection: redirects visitors without a session cookie
 * away from private areas. This is NOT the authorization boundary — every
 * page, action and route handler re-validates the session server-side.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PRIVATE_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/investigations",
  "/discover",
  "/compare",
  "/saved",
  "/lease-review",
  "/move-in",
  "/maintenance",
  "/deposit-protection",
  "/disputes",
  "/documents",
  "/notifications",
  "/reports",
  "/profile",
  "/settings",
  "/organization",
  "/admin",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const cookie = getSessionCookie(request, { cookiePrefix: "safelease" });
    if (!cookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|demo/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
