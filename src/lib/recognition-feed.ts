import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isFounder } from "@/lib/permissions";
import { timeAgo } from "@/lib/time";

const select = {
  id: true,
  kind: true,
  badge: true,
  title: true,
  message: true,
  createdAt: true,
  giverId: true,
  recipient: { select: { id: true, firstName: true, lastName: true, avatarHue: true, title: true } },
  giver: { select: { id: true, firstName: true, lastName: true, avatarHue: true } },
  _count: { select: { cheers: true } },
} satisfies Prisma.RecognitionSelect;

/** Recognitions ready for the client cards, with whether this viewer cheered each. */
export async function recognitionFeed(viewer: { id: string; role: string }, where: Prisma.RecognitionWhereInput, take: number) {
  const rows = await db.recognition.findMany({ where, orderBy: { createdAt: "desc" }, take, select });
  const mine = new Set(
    (await db.recognitionCheer.findMany({ where: { userId: viewer.id, recognitionId: { in: rows.map((r) => r.id) } }, select: { recognitionId: true } })).map(
      (c) => c.recognitionId,
    ),
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    badge: r.badge,
    title: r.title,
    message: r.message,
    createdAt: r.createdAt.toISOString(),
    ago: timeAgo(r.createdAt),
    recipient: r.recipient,
    giver: r.giver,
    cheers: r._count.cheers,
    cheered: mine.has(r.id),
    canDelete: r.giverId === viewer.id || isFounder(viewer as never),
  }));
}

/** The most recognised people over the last `days` days. */
export async function mostRecognised(days = 30, take = 5) {
  const since = new Date(Date.now() - days * 24 * 3600_000);
  const top = await db.recognition.groupBy({
    by: ["recipientId"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { recipientId: "desc" } },
    take,
  });
  const people = await db.user.findMany({
    where: { id: { in: top.map((t) => t.recipientId) } },
    select: { id: true, firstName: true, lastName: true, avatarHue: true, title: true },
  });
  return top.flatMap((t) => {
    const p = people.find((x) => x.id === t.recipientId);
    return p ? [{ ...p, count: t._count._all }] : [];
  });
}
