import { db } from "@/lib/db";
import type { NotificationKind } from "@/generated/prisma/enums";
import { REMINDER_HORIZON_MS, SUBMITTED_STATUSES, deadlineAlerts } from "@/lib/deadline-alerts";
import { inBackground, pushNotices } from "@/lib/push";

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

/**
 * Sends one notification to each recipient, never to the person who caused it,
 * and to their phone if they turned phone notifications on. `push: false` when
 * the caller sends its own phone notification (a ringing call).
 */
export async function notify(recipients: Iterable<string>, input: Omit<NotificationInput, "userId">, opts: { push?: boolean } = {}) {
  const ids = [...new Set(recipients)].filter((id) => id && id !== input.actorId);
  if (ids.length === 0) return;
  const created = await db.notification.createManyAndReturn({
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
    select: { userId: true, title: true, body: true, href: true },
  });
  if (opts.push !== false && created.length) inBackground(() => pushNotices(created));
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
  const horizon = new Date(now.getTime() + REMINDER_HORIZON_MS);
  const tasks = await db.task.findMany({
    where: {
      archivedAt: null,
      status: { notIn: [...SUBMITTED_STATUSES] },
      dueAt: { lte: horizon },
      OR: [{ assignees: { some: { userId } } }, { createdById: userId, dueAt: { lte: now } }],
    },
    select: openTaskSelect,
  });
  const alerts = deadlineAlerts(tasks, now, userId);
  if (alerts.length) await createAndPush(alerts);
  return alerts.length;
}

/** Reminders for everyone. Run by the cron endpoint so nobody misses one while signed out. */
export async function syncAllDeadlineAlerts(now = new Date()) {
  const horizon = new Date(now.getTime() + REMINDER_HORIZON_MS);
  const tasks = await db.task.findMany({
    where: { archivedAt: null, status: { notIn: [...SUBMITTED_STATUSES] }, dueAt: { lte: horizon } },
    select: openTaskSelect,
  });
  const alerts = deadlineAlerts(tasks, now);
  if (alerts.length) await createAndPush(alerts);
  return alerts.length;
}

/** Files reminders (skipping any already sent) and pushes only the new ones. */
async function createAndPush(alerts: ReturnType<typeof deadlineAlerts>) {
  const created = await db.notification.createManyAndReturn({
    data: alerts,
    skipDuplicates: true,
    select: { userId: true, title: true, body: true, href: true },
  });
  if (created.length) inBackground(() => pushNotices(created));
}
