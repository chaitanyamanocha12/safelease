import { requireUser } from "../auth/session";
import { myMemberships } from "./organizations";

/** Resolves the organization the viewer is acting in (?org=), staff roles only. */
export async function orgContext(orgParam?: string) {
  const user = await requireUser();
  const mems = (await myMemberships(user.id)).filter((m) => m.membership.role !== "member");
  const current = mems.find((m) => m.org.id === orgParam) ?? mems[0] ?? null;
  return { user, mems, current };
}
