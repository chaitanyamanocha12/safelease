"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApiUser } from "../auth/session";
import { AppError } from "../errors";
import { action } from "./helpers";
import { deleteAccount } from "../services/account";
import { markRead } from "../services/notifications";

export async function deleteAccountAction(confirmEmail: string) {
  const u = await requireApiUser();
  if (confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()) throw new AppError("VALIDATION", "Type your email address to confirm.");
  await deleteAccount(u.id);
  redirect("/?accountDeleted=1");
}

export const markReadAction = action(z.object({ id: z.string().optional() }), async (u, v) => {
  await markRead(u.id, v.id);
  revalidatePath("/", "layout");
  return null;
});
