"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { isFounder, isLeader } from "@/lib/permissions";
import { BADGE_KEYS, badgeLabel } from "@/lib/recognition";
import { fullName, type ActionResult } from "@/lib/utils";

const schema = z.object({
  recipientId: z.string().min(1, "Pick who you're recognising."),
  kind: z.enum(["KUDOS", "AWARD"]),
  badge: z.enum(BADGE_KEYS as [string, ...string[]]),
  title: z.string().trim().max(80).optional().default(""),
  message: z.string().trim().min(10, "Say what they did — at least a sentence.").max(2000),
});

/**
 * Recognises someone on the company-wide wall. Kudos: anyone, to anyone else —
 * they and the people they report to are told. Awards: founders and management,
 * announced to everyone.
 */
export async function giveRecognition(input: z.input<typeof schema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.recipientId === user.id) return { ok: false, error: "Recognise a colleague — not yourself." };
  if (d.kind === "AWARD" && !isLeader(user)) return { ok: false, error: "Awards come from founders and management. Send kudos instead." };
  if (d.kind === "AWARD" && d.title.length < 3) return { ok: false, error: "Name the award, e.g. Intern of the Month." };

  const recipient = await db.user.findFirst({
    where: { id: d.recipientId, status: { not: "INACTIVE" } },
    select: { id: true, firstName: true, lastName: true, managerId: true, additionalManagers: { select: { managerId: true } } },
  });
  if (!recipient) return { ok: false, error: "That person isn't on the team any more." };

  const r = await db.recognition.create({
    data: { kind: d.kind, badge: d.badge, title: d.kind === "AWARD" ? d.title : null, message: d.message, recipientId: recipient.id, giverId: user.id },
    select: { id: true },
  });

  const href = `/announcements?tab=recognition#r-${r.id}`;
  if (d.kind === "AWARD") {
    const everyone = await db.user.findMany({ where: { status: { not: "INACTIVE" } }, select: { id: true } });
    await notify(
      everyone.map((u) => u.id).filter((id) => id !== recipient.id),
      { kind: "RECOGNITION", actorId: user.id, title: `🏆 ${fullName(recipient)} — ${d.title}`, body: d.message.slice(0, 140), href },
    );
  } else {
    const bosses = [recipient.managerId, ...recipient.additionalManagers.map((m) => m.managerId)].filter((id): id is string => !!id);
    await notify(bosses, {
      kind: "RECOGNITION",
      actorId: user.id,
      title: `${user.firstName} recognised ${recipient.firstName}: ${badgeLabel(d.badge)}`,
      body: d.message.slice(0, 140),
      href,
    });
  }
  await notify([recipient.id], {
    kind: "RECOGNITION",
    actorId: user.id,
    title: d.kind === "AWARD" ? `🏆 You've been given ${d.title}!` : `${user.firstName} recognised you: ${badgeLabel(d.badge)}`,
    body: d.message.slice(0, 140),
    href,
  });
  refresh();
  return {
    ok: true,
    message: d.kind === "AWARD" ? `${recipient.firstName}'s award is on the wall — everyone's been told.` : `Kudos sent to ${recipient.firstName}.`,
  };
}

/** Adds (or takes back) your cheer. */
export async function toggleCheer(recognitionId: string): Promise<ActionResult<{ cheered: boolean }>> {
  const user = await requireUser();
  const r = await db.recognition.findUnique({ where: { id: recognitionId }, select: { id: true } });
  if (!r) return { ok: false, error: "That recognition is gone." };
  const key = { recognitionId_userId: { recognitionId, userId: user.id } };
  const existing = await db.recognitionCheer.findUnique({ where: key, select: { userId: true } });
  if (existing) await db.recognitionCheer.delete({ where: key });
  else await db.recognitionCheer.create({ data: { recognitionId, userId: user.id } });
  refresh();
  return { ok: true, data: { cheered: !existing } };
}

/** Removes a recognition: whoever gave it, or a founder. */
export async function deleteRecognition(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.recognition.findUnique({ where: { id }, select: { giverId: true, recipient: { select: { firstName: true, lastName: true } } } });
  if (!r) return { ok: true };
  if (r.giverId !== user.id && !isFounder(user)) return { ok: false, error: "Only whoever gave it, or a founder, can remove it." };
  await db.recognition.delete({ where: { id } });
  await audit({ actorId: user.id, action: "recognition.removed", targetType: "recognition", targetId: id, summary: `Removed a recognition for ${fullName(r.recipient)}` });
  refresh();
  return { ok: true, message: "Removed." };
}
