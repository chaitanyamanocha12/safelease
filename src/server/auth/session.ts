/**
 * Session access for Server Components, Server Actions and Route Handlers.
 * Every private operation calls `requireUser()` (or a stricter variant) and
 * then scopes queries by the returned user id.
 */
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { AppError } from "../errors";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "renter" | "platform_admin";
  locale: "en" | "fr";
  isDemo: boolean;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    const u = session.user as typeof session.user & { role?: string; locale?: string; isDemo?: boolean };
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role === "platform_admin" ? "platform_admin" : "renter",
      locale: u.locale === "fr" ? "fr" : "en",
      isDemo: Boolean(u.isDemo),
    };
  } catch {
    return null;
  }
});

/** For pages: redirect to login when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** For route handlers: throw a structured 401 instead of redirecting. */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Please sign in.");
  return user;
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "platform_admin") redirect("/dashboard?denied=admin");
  return user;
}

export function assertPlatformAdmin(user: SessionUser) {
  if (user.role !== "platform_admin") throw new AppError("FORBIDDEN", "Platform administrator access required.");
}
