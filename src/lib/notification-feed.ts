import { db } from "@/lib/db";
import type { Actor, GrantedOwnerIds } from "@/lib/permissions";
import { notificationVisibilityWhere } from "@/lib/tasks/queries";

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

type Viewer = Pick<Actor, "id" | "role">;

/** Unread notifications the person may still see; the badge in the app shell. */
export function unreadCount(user: Viewer, grantedOwnerIds: GrantedOwnerIds) {
  return db.notification.count({ where: { AND: [notificationVisibilityWhere(user, grantedOwnerIds), { readAt: null }] } });
}

/**
 * The inbox: only notifications about tasks the person can see right now, so
 * being taken off a task, or losing a grant, hides what was sent about it.
 */
export async function notificationFeed(user: Viewer, grantedOwnerIds: GrantedOwnerIds, take = 20) {
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: notificationVisibilityWhere(user, grantedOwnerIds),
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
    unreadCount(user, grantedOwnerIds),
  ]);
  const feed: FeedItem[] = items.map((n) => ({
    ...n,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));
  return { items: feed, unread };
}
