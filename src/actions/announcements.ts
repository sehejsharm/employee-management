"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { isFounder, isLeader } from "@/lib/permissions";
import { notify } from "@/lib/notifications";
import type { ActionResult } from "@/lib/utils";

const schema = z.object({
  title: z.string().trim().min(3, "Give it a headline.").max(160),
  body: z.string().trim().min(3, "Write the announcement.").max(10000),
  pinned: z.boolean(),
});

export async function postAnnouncement(input: z.input<typeof schema>): Promise<ActionResult> {
  const user = await requireUser();
  if (!isLeader(user)) return { ok: false, error: "Only founders and management can post announcements." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const a = await db.announcement.create({ data: { ...parsed.data, authorId: user.id }, select: { id: true, title: true } });
  const everyone = await db.user.findMany({ where: { status: { not: "INACTIVE" } }, select: { id: true } });
  await notify(
    everyone.map((u) => u.id),
    { kind: "ANNOUNCEMENT", actorId: user.id, title: `${user.firstName}: ${a.title}`, body: parsed.data.body.slice(0, 140), href: "/announcements" },
  );
  refresh();
  return { ok: true, message: "Announcement posted — everyone has been notified." };
}

async function own(id: string) {
  const user = await requireUser();
  const a = await db.announcement.findUnique({ where: { id }, select: { authorId: true, pinned: true } });
  if (!a) return { error: "That announcement is gone." } as const;
  if (a.authorId !== user.id && !isFounder(user)) return { error: "Only the author or a founder can change this." } as const;
  return { a } as const;
}

export async function togglePin(id: string): Promise<ActionResult> {
  const r = await own(id);
  if ("error" in r) return { ok: false, error: r.error! };
  await db.announcement.update({ where: { id }, data: { pinned: !r.a.pinned } });
  refresh();
  return { ok: true, message: r.a.pinned ? "Unpinned." : "Pinned to the top." };
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  const r = await own(id);
  if ("error" in r) return { ok: false, error: r.error! };
  await db.announcement.delete({ where: { id } });
  refresh();
  return { ok: true, message: "Deleted." };
}
