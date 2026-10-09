import { db } from "@/lib/db";
import type { NotificationKind } from "@/generated/prisma/enums";
import { DUE_SOON_HOURS } from "@/lib/time";
import { deadlineAlerts } from "@/lib/deadline-alerts";

const HOUR = 60 * 60 * 1000;

export interface NotificationInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
  taskId?: string | null;
  actorId?: string | null;
  dedupeKey?: string | null;
}

/** Sends one notification to each recipient, never to the person who caused it. */
export async function notify(recipients: Iterable<string>, input: Omit<NotificationInput, "userId">) {
  const ids = [...new Set(recipients)].filter((id) => id && id !== input.actorId);
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      taskId: input.taskId ?? null,
      actorId: input.actorId ?? null,
      dedupeKey: input.dedupeKey ?? null,
    })),
    skipDuplicates: true,
  });
}

const openTaskSelect = {
  id: true,
  number: true,
  title: true,
  dueAt: true,
  createdById: true,
  assignees: { select: { userId: true, user: { select: { firstName: true } } } },
} as const;

/** Reminders for one person. Cheap; called whenever their client polls. */
export async function syncDeadlineAlertsFor(userId: string, now = new Date()) {
  const horizon = new Date(now.getTime() + DUE_SOON_HOURS * HOUR);
  const tasks = await db.task.findMany({
    where: {
      archivedAt: null,
      status: { not: "DONE" },
      dueAt: { lte: horizon },
      OR: [{ assignees: { some: { userId } } }, { createdById: userId, dueAt: { lte: now } }],
    },
    select: openTaskSelect,
  });
  const alerts = deadlineAlerts(tasks, now, userId);
  if (alerts.length) await db.notification.createMany({ data: alerts, skipDuplicates: true });
  return alerts.length;
}

/** Reminders for everyone. Run by the cron endpoint so nobody misses one while signed out. */
export async function syncAllDeadlineAlerts(now = new Date()) {
  const horizon = new Date(now.getTime() + DUE_SOON_HOURS * HOUR);
  const tasks = await db.task.findMany({
    where: { archivedAt: null, status: { not: "DONE" }, dueAt: { lte: horizon } },
    select: openTaskSelect,
  });
  const alerts = deadlineAlerts(tasks, now);
  if (alerts.length) await db.notification.createMany({ data: alerts, skipDuplicates: true });
  return alerts.length;
}
