import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isFounder, type Actor } from "@/lib/permissions";
import { taskRowSelect, toClientRow } from "@/lib/tasks/queries";
import { dayKey, startOfDayInZone } from "@/lib/time";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

const open: Prisma.TaskWhereInput = { archivedAt: null, status: { not: "DONE" } };

/** Everything an individual needs to see first thing: their own work. */
export async function memberDashboard(userId: string) {
  const now = new Date();
  const mine: Prisma.TaskWhereInput = { archivedAt: null, assignees: { some: { userId } } };

  const [tasks, doneThisWeek, requests, announcements] = await Promise.all([
    db.task.findMany({ where: { ...mine, status: { not: "DONE" } }, select: taskRowSelect, orderBy: { dueAt: "asc" }, take: 50 }),
    db.task.count({ where: { ...mine, status: "DONE", completedAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    db.updateRequest.findMany({
      where: { resolvedAt: null, task: { ...mine, status: { not: "DONE" } } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        message: true,
        createdAt: true,
        task: { select: { id: true, number: true, title: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true, avatarHue: true } },
      },
    }),
    db.announcement.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 2,
      select: { id: true, title: true, body: true, pinned: true, createdAt: true, author: { select: { firstName: true, lastName: true, avatarHue: true } } },
    }),
  ]);

  const rows = tasks.map(toClientRow);
  const overdue = rows.filter((t) => new Date(t.dueAt) < now).length;
  const dueSoon = rows.filter((t) => {
    const ms = new Date(t.dueAt).getTime() - now.getTime();
    return ms > 0 && ms <= DAY;
  }).length;

  return {
    rows,
    stats: { open: rows.length, dueSoon, overdue, doneThisWeek },
    next: rows.find((t) => new Date(t.dueAt) >= now) ?? rows[0] ?? null,
    requests,
    announcements,
  };
}

/** Who a leader looks after: everyone for founders, the reporting line for managers. */
async function teamIds(user: Actor, subordinateIds: Set<string>) {
  if (isFounder(user)) {
    const all = await db.user.findMany({ where: { status: { not: "INACTIVE" } }, select: { id: true } });
    return all.map((u) => u.id);
  }
  return [user.id, ...subordinateIds];
}

/**
 * Mission control: the whole team's work as live telemetry. Founders see the
 * company; managers see their reporting line and the work they've handed out.
 */
export async function missionControl(user: Actor, subordinateIds: Set<string>, tz: string) {
  const now = new Date();
  const ids = await teamIds(user, subordinateIds);
  const scope: Prisma.TaskWhereInput = isFounder(user)
    ? { archivedAt: null }
    : { archivedAt: null, OR: [{ createdById: user.id }, { assignees: { some: { userId: { in: ids } } } }] };

  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY);
  const seriesStart = startOfDayInZone(new Date(now.getTime() - 13 * DAY), tz);
  const monthAgo = new Date(now.getTime() - 30 * DAY);

  const [openTasks, doneThisWeek, donePrevWeek, statusGroups, schedule, requests, recent, people, completedSeries, createdSeries, closedMonth, departments] =
    await Promise.all([
      db.task.findMany({
        where: { AND: [scope, open] },
        select: { id: true, dueAt: true, status: true, assignees: { select: { userId: true } } },
      }),
      db.task.count({ where: { AND: [scope, { status: "DONE", completedAt: { gte: weekAgo } }] } }),
      db.task.count({ where: { AND: [scope, { status: "DONE", completedAt: { gte: twoWeeksAgo, lt: weekAgo } }] } }),
      db.task.groupBy({ by: ["status"], where: { AND: [scope, open] }, _count: { _all: true } }),
      db.task.findMany({ where: { AND: [scope, open] }, select: taskRowSelect, orderBy: { dueAt: "asc" }, take: 8 }),
      db.updateRequest.findMany({
        where: { resolvedAt: null, task: { AND: [scope, open] }, ...(isFounder(user) ? {} : { requestedById: user.id }) },
        orderBy: { createdAt: "asc" },
        take: 6,
        select: {
          id: true,
          message: true,
          createdAt: true,
          requestedBy: { select: { firstName: true } },
          task: {
            select: {
              id: true,
              number: true,
              title: true,
              assignees: { select: { user: { select: { id: true, firstName: true, lastName: true, avatarHue: true } } } },
            },
          },
        },
      }),
      db.taskActivity.findMany({
        where: { kind: { in: ["PROGRESS_UPDATE", "STATUS_CHANGED", "COMMENT", "CREATED", "UPDATE_REQUESTED", "ATTACHMENT_ADDED"] }, task: scope },
        orderBy: { createdAt: "desc" },
        take: 16,
        select: {
          id: true,
          kind: true,
          body: true,
          meta: true,
          createdAt: true,
          actor: { select: { firstName: true, lastName: true } },
          task: { select: { id: true, number: true } },
        },
      }),
      db.user.findMany({
        where: { id: { in: ids }, status: { not: "INACTIVE" } },
        orderBy: { orgOrder: "asc" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarHue: true,
          title: true,
          role: true,
          status: true,
          focus: true,
          department: { select: { name: true, color: true } },
        },
      }),
      db.task.findMany({ where: { AND: [scope, { status: "DONE", completedAt: { gte: seriesStart } }] }, select: { completedAt: true } }),
      db.task.findMany({ where: { AND: [scope, { createdAt: { gte: seriesStart } }] }, select: { createdAt: true } }),
      db.task.findMany({ where: { AND: [scope, { status: "DONE", completedAt: { gte: monthAgo } }] }, select: { completedAt: true, dueAt: true } }),
      db.department.count(),
    ]);

  const load = new Map<string, { open: number; overdue: number; soon: number }>();
  for (const t of openTasks) {
    const ms = t.dueAt.getTime() - now.getTime();
    for (const a of t.assignees) {
      const entry = load.get(a.userId) ?? { open: 0, overdue: 0, soon: 0 };
      entry.open += 1;
      if (ms < 0) entry.overdue += 1;
      else if (ms <= 2 * DAY) entry.soon += 1;
      load.set(a.userId, entry);
    }
  }
  const crew = people.map((p) => ({ ...p, ...(load.get(p.id) ?? { open: 0, overdue: 0, soon: 0 }) }));

  // Fourteen days of throughput, bucketed by calendar day in the viewer's zone.
  const days: { key: string; completed: number; created: number }[] = [];
  for (let i = 13; i >= 0; i--) days.push({ key: dayKey(new Date(now.getTime() - i * DAY), tz), completed: 0, created: 0 });
  const index = new Map(days.map((d, i) => [d.key, i]));
  for (const t of completedSeries) {
    const i = index.get(dayKey(t.completedAt!, tz));
    if (i !== undefined) days[i].completed += 1;
  }
  for (const t of createdSeries) {
    const i = index.get(dayKey(t.createdAt, tz));
    if (i !== undefined) days[i].created += 1;
  }

  const onTime = closedMonth.length ? Math.round((closedMonth.filter((t) => t.completedAt! <= t.dueAt).length / closedMonth.length) * 100) : null;
  const counts = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])) as Record<string, number>;

  return {
    generatedAt: now.toISOString(),
    stats: {
      open: openTasks.length,
      dueSoon: openTasks.filter((t) => t.dueAt >= now && t.dueAt.getTime() - now.getTime() <= 2 * DAY).length,
      overdue: openTasks.filter((t) => t.dueAt < now).length,
      doneThisWeek,
      donePrevWeek,
      onTime,
      closedMonth: closedMonth.length,
      awaitingUpdates: requests.length,
      crew: people.length,
      departments,
    },
    status: {
      TODO: counts.TODO ?? 0,
      IN_PROGRESS: counts.IN_PROGRESS ?? 0,
      IN_REVIEW: counts.IN_REVIEW ?? 0,
      BLOCKED: counts.BLOCKED ?? 0,
    },
    schedule: schedule.map(toClientRow),
    requests: requests.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    recent: recent.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), meta: (a.meta ?? null) as Record<string, unknown> | null })),
    crew,
    series: days,
  };
}

export type MissionData = Awaited<ReturnType<typeof missionControl>>;

/** What each founder is carrying — the leadership board's data, also used on the founders' dashboard. */
export async function founderPulse() {
  return db.user.findMany({
    where: { role: "FOUNDER", status: { not: "INACTIVE" } },
    orderBy: { orgOrder: "asc" },
    select: { id: true, firstName: true, lastName: true, title: true, avatarHue: true, focus: true, focusUpdatedAt: true },
  });
}
