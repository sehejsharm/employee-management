import { db } from "@/lib/db";

export interface FeedItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  actor: { firstName: string; lastName: string; avatarHue: number } | null;
}

export async function notificationFeed(userId: string, take = 20) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        createdAt: true,
        actor: { select: { firstName: true, lastName: true, avatarHue: true } },
      },
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  const feed: FeedItem[] = items.map((n) => ({
    ...n,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));
  return { items: feed, unread };
}
