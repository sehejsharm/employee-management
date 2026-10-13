"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { dayKey, formatLongDate, startOfDayInZone } from "@/lib/time";
import { meetingsToday } from "@/lib/meetings";
import { getTimeZone } from "@/lib/tz.server";
import { briefingHeadline, groupBriefing, type Briefing } from "@/lib/daily-briefing";

/**
 * Called by the app shell on every page load. The first call of each calendar
 * day (in the person's time zone) files a "your day" notification in their
 * inbox and returns the summary to show; every later call that day returns null.
 * `force` returns today's summary again without filing anything (the "Today" button).
 */
export async function claimDailyBriefing(force = false): Promise<Briefing | null> {
  const user = await requireUser();
  const tz = await getTimeZone();
  const now = new Date();
  const day = dayKey(now, tz);
  const dedupeKey = `briefing:${day}`;

  if (!force) {
    const already = await db.notification.findUnique({ where: { userId_dedupeKey: { userId: user.id, dedupeKey } }, select: { id: true } });
    if (already) return null;
  }

  const dayStart = startOfDayInZone(now, tz);
  const [assigned, toReview, updatesRequested, meetings] = await Promise.all([
    db.task.findMany({
      // Handed in (in review) or finished work no longer needs doing by them.
      where: { archivedAt: null, status: { notIn: ["DONE", "IN_REVIEW"] }, assignees: { some: { userId: user.id } } },
      orderBy: { dueAt: "asc" },
      take: 60,
      select: { id: true, number: true, title: true, dueAt: true, priority: true, assignees: { where: { userId: user.id }, select: { role: true } } },
    }),
    db.task.findMany({
      where: { archivedAt: null, status: "IN_REVIEW", createdById: user.id },
      orderBy: { dueAt: "asc" },
      take: 10,
      select: { id: true, number: true, title: true },
    }),
    db.updateRequest.count({
      where: { resolvedAt: null, task: { archivedAt: null, status: { not: "DONE" }, assignees: { some: { userId: user.id } } } },
    }),
    meetingsToday(user.id, now, new Date(dayStart.getTime() + 24 * 3600_000)),
  ]);

  const groups = groupBriefing(
    assigned.map((t) => ({
      id: t.id,
      number: t.number,
      title: t.title,
      dueAt: t.dueAt.toISOString(),
      priority: t.priority,
      isLead: t.assignees[0]?.role === "LEAD",
    })),
    tz,
    now,
  );
  const headline = briefingHeadline(groups, toReview.length, updatesRequested, meetings.length);

  let notificationId: string | null = null;
  if (!force) {
    // The unique (userId, dedupeKey) pair makes this race-safe: two tabs opening at once file one briefing.
    const created = await db.notification.createManyAndReturn({
      data: [
        {
          userId: user.id,
          kind: "DAILY_BRIEFING",
          title: `Your day · ${formatLongDate(now, tz)}`,
          body: headline,
          href: "/dashboard?view=me",
          dedupeKey,
        },
      ],
      skipDuplicates: true,
      select: { id: true },
    });
    if (created.length === 0) return null;
    notificationId = created[0].id;
  }

  return {
    notificationId,
    day,
    tz,
    groups,
    toReview,
    updatesRequested,
    meetings: meetings.map((m) => ({ id: m.id, title: m.title, startAt: m.startAt.toISOString(), meetUrl: m.meetUrl })),
    headline,
  };
}
