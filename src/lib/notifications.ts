import { db } from "@/lib/db";
import type { NotificationKind, Role } from "@/generated/prisma/enums";
import { DUE_SOON_HOURS } from "@/lib/time";
import { deadlineAlerts } from "@/lib/deadline-alerts";
import { NO_GRANTS, canViewTask, taskAccess, type TaskAccessContext } from "@/lib/permissions";
import { taskAccessSelect } from "@/lib/tasks/queries";
import { grantedOwnersByViewer } from "@/lib/visibility";

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

/**
 * Drops every notification about a task its recipient may not see right now.
 * Every notification is written through here, so a caller passing the wrong
 * people (say, someone who asked for an update before losing access) can never
 * leak a task's title, comments or progress.
 */
async function onlyVisible<T extends Pick<NotificationInput, "userId" | "taskId">>(rows: T[], known = new Map<string, TaskAccessContext>()) {
  const taskIds = [...new Set(rows.map((r) => r.taskId).filter((id): id is string => !!id && !known.has(id)))];
  const access = new Map(known);
  if (taskIds.length) {
    const tasks = await db.task.findMany({ where: { id: { in: taskIds }, archivedAt: null }, select: { id: true, ...taskAccessSelect } });
    for (const t of tasks) access.set(t.id, taskAccess(t));
  }

  // The creator and assignees always qualify; only look up the others.
  const isParticipant = (r: T, t: TaskAccessContext) => t.createdById === r.userId || t.assigneeIds.includes(r.userId);
  const others = [
    ...new Set(rows.filter((r) => r.taskId && access.has(r.taskId) && !isParticipant(r, access.get(r.taskId)!)).map((r) => r.userId)),
  ];
  const [people, grants] = others.length
    ? await Promise.all([db.user.findMany({ where: { id: { in: others } }, select: { id: true, role: true } }), grantedOwnersByViewer(others)])
    : [[], new Map<string, Set<string>>()];
  const roleOf = new Map(people.map((p) => [p.id, p.role]));

  return rows.filter((r) => {
    if (!r.taskId) return true;
    const t = access.get(r.taskId);
    if (!t) return false;
    if (isParticipant(r, t)) return true;
    const role = roleOf.get(r.userId);
    return !!role && canViewTask({ id: r.userId, role }, t, grants.get(r.userId) ?? NO_GRANTS);
  });
}

async function store(rows: NotificationInput[], known?: Map<string, TaskAccessContext>) {
  const visible = await onlyVisible(rows, known);
  if (visible.length === 0) return 0;
  await db.notification.createMany({
    data: visible.map((n) => ({
      userId: n.userId,
      kind: n.kind,
      title: n.title,
      body: n.body ?? null,
      href: n.href ?? null,
      taskId: n.taskId ?? null,
      actorId: n.actorId ?? null,
      dedupeKey: n.dedupeKey ?? null,
    })),
    skipDuplicates: true,
  });
  return visible.length;
}

/**
 * Sends one notification to each recipient, never to the person who caused
 * it, and never to anyone who can't see the task it is about.
 */
export async function notify(recipients: Iterable<string>, input: Omit<NotificationInput, "userId">) {
  const ids = [...new Set(recipients)].filter((id) => id && id !== input.actorId);
  if (ids.length === 0) return;
  await store(ids.map((userId) => ({ ...input, userId })));
}

const openTaskSelect = {
  id: true,
  number: true,
  title: true,
  dueAt: true,
  createdById: true,
  assignees: { select: { userId: true, user: { select: { firstName: true, role: true } } } },
} as const;

type OpenTaskRow = { id: string; createdById: string; assignees: { userId: string; user: { role: Role } }[] };
const accessMap = (tasks: OpenTaskRow[]) => new Map(tasks.map((t) => [t.id, taskAccess(t)]));

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
  return store(deadlineAlerts(tasks, now, userId), accessMap(tasks));
}

/** Reminders for everyone. Run by the cron endpoint so nobody misses one while signed out. */
export async function syncAllDeadlineAlerts(now = new Date()) {
  const horizon = new Date(now.getTime() + DUE_SOON_HOURS * HOUR);
  const tasks = await db.task.findMany({
    where: { archivedAt: null, status: { not: "DONE" }, dueAt: { lte: horizon } },
    select: openTaskSelect,
  });
  return store(deadlineAlerts(tasks, now), accessMap(tasks));
}
