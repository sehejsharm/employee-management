import "server-only";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { taskRef } from "@/lib/utils";
import type { RepeatFrequency } from "@/generated/prisma/enums";

/**
 * Repeating tasks. A founder sets one up once ("Post on LinkedIn", every day for
 * 30 days); each occurrence becomes an ordinary task shortly before it's due —
 * a day ahead for daily and weekday series, a week ahead for weekly ones — so
 * the assignee sees the next one, not thirty at once.
 */

export const REPEAT_LABEL: Record<RepeatFrequency, string> = {
  DAILY: "every day",
  WEEKDAYS: "every weekday",
  WEEKLY: "every week",
};

export const MAX_OCCURRENCES = 90;

const DAY = 86_400_000;

/** How long before its deadline an occurrence appears. */
function leadTime(frequency: RepeatFrequency) {
  return frequency === "WEEKLY" ? 7 * DAY : DAY;
}

/** Wall-clock parts of `date` in `tz`. */
function localParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")),
    min: Number(get("minute")),
    s: Number(get("second")),
    weekday: get("weekday"),
  };
}

/** The instant that reads as the given wall-clock time in `tz` (handles DST by re-checking the offset). */
function fromLocal(y: number, m: number, d: number, h: number, min: number, s: number, tz: string) {
  const wanted = Date.UTC(y, m - 1, d, h, min, s);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), tz);
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    guess += wanted - seen;
  }
  return new Date(guess);
}

/** Same time of day, `days` later, in `tz`. */
function addLocalDays(date: Date, days: number, tz: string) {
  const p = localParts(date, tz);
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return fromLocal(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), p.h, p.min, p.s, tz);
}

/** The deadline of the occurrence after one due at `due`. */
export function nextDue(due: Date, frequency: RepeatFrequency, tz: string) {
  if (frequency === "WEEKLY") return addLocalDays(due, 7, tz);
  let next = addLocalDays(due, 1, tz);
  if (frequency === "WEEKDAYS") {
    while (["Sat", "Sun"].includes(localParts(next, tz).weekday)) next = addLocalDays(next, 1, tz);
  }
  return next;
}

/** If `due` itself falls on a weekend in a weekday series, the first weekday after it. */
export function firstDue(due: Date, frequency: RepeatFrequency, tz: string) {
  let first = due;
  if (frequency === "WEEKDAYS") {
    while (["Sat", "Sun"].includes(localParts(first, tz).weekday)) first = addLocalDays(first, 1, tz);
  }
  return first;
}

/** Every deadline in a series, for previews ("30 tasks, 14 Oct → 12 Nov"). */
export function seriesDueDates(start: Date, frequency: RepeatFrequency, total: number, tz: string) {
  const out = [firstDue(start, frequency, tz)];
  while (out.length < total) out.push(nextDue(out[out.length - 1], frequency, tz));
  return out;
}

type Attachment = { kind: "LINK" | "NOTE"; title: string; url?: string; content?: string };

/**
 * Creates the next occurrence of a series if it's time. Safe to call from
 * several places at once: the series row is claimed atomically, so each
 * occurrence is created exactly once. Returns the new task, if any.
 */
export async function createNextOccurrence(seriesId: string, now = new Date(), opts: { force?: boolean } = {}) {
  const series = await db.taskSeries.findUnique({ where: { id: seriesId } });
  if (!series || series.stoppedAt || !series.nextDueAt || series.created >= series.total) return null;
  if (!opts.force && series.nextDueAt.getTime() - leadTime(series.frequency) > now.getTime()) return null;

  // Only people who are still here get new occurrences.
  const active = await db.user.findMany({
    where: { id: { in: series.assigneeIds }, status: { not: "INACTIVE" } },
    select: { id: true },
  });
  const assigneeIds = series.assigneeIds.filter((id) => active.some((a) => a.id === id));
  if (assigneeIds.length === 0) {
    await db.taskSeries.update({ where: { id: series.id }, data: { stoppedAt: now, nextDueAt: null } });
    return null;
  }
  const lead = assigneeIds.includes(series.leadId) ? series.leadId : assigneeIds[0];
  const index = series.created + 1;
  const due = series.nextDueAt;
  const following = index < series.total ? nextDue(due, series.frequency, series.timeZone) : null;
  const attachments = (Array.isArray(series.attachments) ? series.attachments : []) as Attachment[];

  const task = await db.$transaction(async (tx) => {
    const claimed = await tx.taskSeries.updateMany({
      where: { id: series.id, created: series.created, stoppedAt: null },
      data: { created: index, nextDueAt: following },
    });
    if (claimed.count === 0) return null;
    return tx.task.create({
      data: {
        title: series.title,
        description: series.description,
        priority: series.priority,
        dueAt: due,
        createdById: series.createdById,
        seriesId: series.id,
        seriesIndex: index,
        assignees: { create: assigneeIds.map((userId) => ({ userId, role: userId === lead ? ("LEAD" as const) : ("FOLLOWER" as const) })) },
        checklist: { create: series.checklist.map((text, position) => ({ text, position })) },
        attachments: {
          create: attachments.map((a) => ({
            kind: a.kind,
            title: a.title,
            url: a.kind === "LINK" ? a.url : null,
            content: a.kind === "NOTE" ? a.content : null,
            createdById: series.createdById,
          })),
        },
        activities: { create: { actorId: series.createdById, kind: "CREATED", meta: { series: { index, total: series.total } } } },
      },
      select: { id: true, number: true, title: true },
    });
  });
  if (!task) return null;

  const creator = await db.user.findUnique({ where: { id: series.createdById }, select: { firstName: true } });
  const ref = taskRef(task.number);
  const label = `${index} of ${series.total}`;
  await notify(assigneeIds, {
    kind: "TASK_ASSIGNED",
    actorId: series.createdById,
    taskId: task.id,
    href: `/tasks/${task.id}`,
    title: `${creator?.firstName ?? "A founder"}'s repeating task: ${ref} (${label})`,
    body: task.title,
  });
  return task;
}

/** Creates every occurrence that's due to appear. Called by the daily cron and, throttled, while people use the app. */
export async function materializeTaskSeries(now = new Date()) {
  const due = await db.taskSeries.findMany({
    where: { stoppedAt: null, nextDueAt: { not: null, lte: new Date(now.getTime() + 7 * DAY) } },
    select: { id: true },
    take: 200,
  });
  let created = 0;
  for (const { id } of due) {
    // Catch up on any missed occurrences, but never loop forever.
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      const task = await createNextOccurrence(id, now).catch((e) => {
        console.error("repeating task occurrence failed", id, e);
        return null;
      });
      if (!task) break;
      created++;
    }
  }
  return created;
}

let lastRun = 0;
/** At most once every five minutes per server instance; never throws. */
export async function materializeTaskSeriesThrottled() {
  const now = Date.now();
  if (now - lastRun < 5 * 60_000) return;
  lastRun = now;
  await materializeTaskSeries().catch((e) => console.error("repeating tasks sweep failed", e));
}
