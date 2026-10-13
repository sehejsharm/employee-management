"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { audit } from "@/lib/audit";
import { isFounder } from "@/lib/permissions";
import { fullName, type ActionResult } from "@/lib/utils";
import { fileWorkReport } from "@/lib/work-report";

/** Files a copy of someone's report right now (founders). */
export async function saveWorkReportNow(userId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!isFounder(user)) return { ok: false, error: "Only founders can file work reports." };
  const id = await fileWorkReport(userId, "MANUAL", user.id);
  if (!id) return { ok: false, error: "That person no longer exists." };
  refresh();
  return { ok: true, message: "A copy was saved. You can download it any time." };
}

const lastDaySchema = z.object({ date: z.union([z.literal(""), z.iso.date("Pick a date.")]) });

/** Sets someone's last working day — their report is filed that day (founders). */
export async function setLastDay(userId: string, input: z.input<typeof lastDaySchema>): Promise<ActionResult> {
  const user = await requireUser();
  if (!isFounder(user)) return { ok: false, error: "Only founders can set a last day." };
  const parsed = lastDaySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const target = await db.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  if (!target) return { ok: false, error: "That person no longer exists." };
  // Noon UTC keeps the calendar day the same in every time zone the team works in.
  const lastDay = parsed.data.date ? new Date(`${parsed.data.date}T12:00:00Z`) : null;
  await db.user.update({ where: { id: userId }, data: { lastDay } });
  await audit({
    actorId: user.id,
    action: "account.last_day_set",
    targetType: "user",
    targetId: userId,
    summary: lastDay ? `Set ${fullName(target)}'s last day to ${parsed.data.date}` : `Cleared ${fullName(target)}'s last day`,
  });
  refresh();
  return { ok: true, message: lastDay ? "Last day saved — their report will be filed that day." : "Last day cleared." };
}
