"use server";

import { isValidPhone } from "@/lib/phone";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { currentSessionTokenHash, revokeAllSessions } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/lib/utils";

/** "What I'm focused on" — self-reported, shown on the org chart and leadership board. */
export async function setFocus(text: string): Promise<ActionResult> {
  const user = await requireUser();
  const focus = text.trim().slice(0, 160);
  await db.user.update({
    where: { id: user.id },
    data: { focus: focus || null, focusUpdatedAt: focus ? new Date() : null },
  });
  refresh();
  return { ok: true, message: focus ? "Focus updated." : "Focus cleared." };
}

const profileSchema = z.object({
  phone: z.string().trim().max(32).optional().default(""),
  location: z.string().trim().max(80).optional().default(""),
  bio: z.string().trim().max(600).optional().default(""),
  avatarHue: z.number().int().min(0).max(360),
});

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.phone && !isValidPhone(d.phone)) return { ok: false, error: "Enter a valid phone number, e.g. +91 98765 43210." };
  // Phone and location are required details: they can be changed, not removed.
  const current = await db.user.findUnique({ where: { id: user.id }, select: { phone: true, location: true } });
  if (!d.phone && current?.phone) return { ok: false, error: "Your phone number is required — change it rather than removing it." };
  if (!d.location && current?.location) return { ok: false, error: "Your location is required — change it rather than removing it." };
  await db.user.update({
    where: { id: user.id },
    data: { phone: d.phone || null, location: d.location || null, bio: d.bio || null, avatarHue: d.avatarHue },
  });
  refresh();
  return { ok: true, message: "Profile saved." };
}

export async function changePassword(input: { current: string; next: string; confirm: string }): Promise<ActionResult> {
  const user = await requireUser();
  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(input.current, row?.passwordHash))) return { ok: false, error: "Your current password is incorrect." };
  const problems = passwordProblems(input.next);
  if (problems.length) return { ok: false, error: `Your new password needs: ${problems.join(", ").toLowerCase()}.` };
  if (input.next !== input.confirm) return { ok: false, error: "The new passwords don't match." };
  if (input.next === input.current) return { ok: false, error: "Choose a password different from your current one." };

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.next), passwordChangedAt: new Date(), mustChangePassword: false },
  });
  await revokeAllSessions(user.id, await currentSessionTokenHash());
  await audit({ actorId: user.id, action: "account.password_changed", targetType: "user", targetId: user.id, summary: "Changed their password" });
  return { ok: true, message: "Password changed. Other devices have been signed out." };
}

export async function signOutOtherSessions(): Promise<ActionResult> {
  const user = await requireUser();
  await revokeAllSessions(user.id, await currentSessionTokenHash());
  refresh();
  return { ok: true, message: "Signed out of every other device." };
}
