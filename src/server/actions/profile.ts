"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "./helpers";
import { saveProfile, updateUserBasics } from "../services/profile";
import { savePreferences } from "../services/notifications";
import { parseMoneyToCents } from "@/lib/money";

const profileSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  city: z.string().max(60).optional(),
  province: z.string().max(4).optional(),
  renterType: z.enum(["student", "international_student", "newcomer", "first_time", "relocating", "general"]).optional().or(z.literal("")),
  budgetMax: z.string().max(10).optional(),
  bedrooms: z.string().max(2).optional(),
  desiredLocation: z.string().max(120).optional(),
  moveInDate: z.string().max(10).optional(),
  accessibilityNeeds: z.string().max(500).optional(),
  locale: z.enum(["en", "fr"]).optional(),
  complete: z.boolean().optional(),
  retentionDays: z.string().max(5).optional(),
});

export const saveProfileAction = action(profileSchema, async (u, v) => {
  await saveProfile(u.id, {
    city: v.city || null,
    province: v.province || null,
    renterType: v.renterType || null,
    budgetMaxCents: v.budgetMax ? parseMoneyToCents(v.budgetMax) : null,
    bedrooms: v.bedrooms ? Number.parseInt(v.bedrooms, 10) : null,
    desiredLocation: v.desiredLocation || null,
    moveInDate: v.moveInDate || null,
    accessibilityNeeds: v.accessibilityNeeds || null,
    ...(v.complete ? { onboardingCompletedAt: new Date() } : {}),
    ...(v.retentionDays !== undefined ? { retentionDays: v.retentionDays ? Number(v.retentionDays) : null } : {}),
  });
  if (v.name || v.locale) await updateUserBasics(u.id, { name: v.name, locale: v.locale });
  revalidatePath("/", "layout");
  return null;
});

export const savePreferencesAction = action(
  z.object({ inApp: z.boolean(), email: z.boolean(), deadlineReminders: z.boolean(), listingUpdates: z.boolean(), caseUpdates: z.boolean() }),
  async (u, v) => {
    await savePreferences(u.id, v);
    revalidatePath("/settings");
    return null;
  },
);
