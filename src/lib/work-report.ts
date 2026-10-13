import "server-only";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { ROLE_LABEL } from "@/lib/permissions";
import { dayKey } from "@/lib/time";
import { fullName, taskRef } from "@/lib/utils";
import { badgeLabel } from "@/lib/recognition";
import type { WorkReportReason } from "@/generated/prisma/enums";
import { summarise, type ReportTask, type WorkReportData } from "@/lib/work-report-summary";

export type { WorkReportData } from "@/lib/work-report-summary";

/**
 * Someone's work, start to finish: what they were given, what they delivered
 * and how it went. Founders see it live at any time; a copy is filed on their
 * last day and when they're offboarded. Only work — no activity tracking.
 */
export async function buildWorkReport(userId: string, now = new Date()): Promise<WorkReportData | null> {
  const person = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      email: true,
      title: true,
      role: true,
      status: true,
      joinedAt: true,
      createdAt: true,
      lastDay: true,
      department: { select: { name: true } },
      manager: { select: { firstName: true, lastName: true } },
      additionalManagers: { select: { manager: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!person) return null;

  const [assignments, submissions, updates, comments, requests, meetings, recognitions] = await Promise.all([
    db.taskAssignee.findMany({
      // Merged-away tasks live on in the task they were merged into, so they're left out here.
      where: { userId, task: { mergedIntoId: null } },
      select: {
        role: true,
        task: {
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            priority: true,
            dueAt: true,
            completedAt: true,
            archivedAt: true,
            createdAt: true,
            createdBy: { select: { firstName: true, lastName: true } },
            submissions: { where: { submittedById: userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true, status: true } },
          },
        },
      },
    }),
    db.submission.findMany({
      where: { submittedById: userId },
      orderBy: { createdAt: "desc" },
      select: { status: true, reviewNote: true, reviewedAt: true, task: { select: { number: true, title: true } }, reviewedBy: { select: { firstName: true, lastName: true } } },
    }),
    db.taskActivity.count({ where: { actorId: userId, kind: "PROGRESS_UPDATE" } }),
    db.taskActivity.count({ where: { actorId: userId, kind: "COMMENT" } }),
    db.updateRequest.findMany({ where: { task: { assignees: { some: { userId } } } }, select: { resolvedAt: true } }),
    db.meeting.count({
      where: { status: "SCHEDULED", startAt: { lte: now }, OR: [{ organizerId: userId }, { hostId: userId }, { attendees: { some: { userId } } }] },
    }),
    db.recognition.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: "desc" },
      select: { kind: true, badge: true, title: true, message: true, createdAt: true, giver: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const tasks: ReportTask[] = assignments
    .filter((a) => !a.task.archivedAt)
    .map(({ role, task }) => {
      const firstSubmitted = task.submissions[0]?.createdAt ?? null;
      const delivered = task.status === "DONE" ? (firstSubmitted ?? task.completedAt) : firstSubmitted;
      return {
        ref: taskRef(task.number),
        title: task.title,
        role,
        status: task.status,
        priority: task.priority,
        assignedBy: fullName(task.createdBy),
        assignedAt: task.createdAt.toISOString(),
        dueAt: task.dueAt.toISOString(),
        deliveredAt: delivered ? delivered.toISOString() : null,
        completedAt: task.completedAt?.toISOString() ?? null,
        onTime: delivered ? delivered.getTime() <= task.dueAt.getTime() : task.status !== "DONE" && task.dueAt.getTime() < now.getTime() ? false : null,
      };
    })
    .sort((a, b) => b.dueAt.localeCompare(a.dueAt));

  const from = person.joinedAt ?? person.createdAt;
  const to = person.lastDay && person.lastDay < now ? person.lastDay : now;

  return summarise({
    generatedAt: now.toISOString(),
    person: {
      name: fullName(person),
      employeeCode: person.employeeCode,
      email: person.email,
      title: person.title,
      role: ROLE_LABEL[person.role],
      department: person.department?.name ?? null,
      reportsTo: [person.manager, ...person.additionalManagers.map((a) => a.manager)].filter(Boolean).map((m) => fullName(m!)),
      status: person.status,
      joinedAt: from.toISOString(),
      lastDay: person.lastDay?.toISOString() ?? null,
    },
    period: { from: from.toISOString(), to: to.toISOString() },
    tasks,
    submissions: submissions.map((s) => ({
      status: s.status,
      task: `${taskRef(s.task.number)} · ${s.task.title}`,
      reviewNote: s.reviewNote,
      reviewedBy: s.reviewedBy ? fullName(s.reviewedBy) : null,
      reviewedAt: s.reviewedAt?.toISOString() ?? null,
    })),
    progressUpdates: updates,
    comments,
    updateRequests: { received: requests.length, answered: requests.filter((r) => r.resolvedAt).length },
    meetings,
    recognitions: recognitions.map((r) => ({
      kind: r.kind,
      badge: badgeLabel(r.badge),
      title: r.title,
      message: r.message,
      from: fullName(r.giver),
      at: r.createdAt.toISOString(),
    })),
    now: now.toISOString(),
  });
}

/** Saves a copy of the report and tells the founders where it is. */
export async function fileWorkReport(userId: string, reason: WorkReportReason, actorId: string | null = null) {
  const data = await buildWorkReport(userId);
  if (!data) return null;
  const report = await db.workReport.create({ data: { userId, reason, generatedById: actorId, data: data as never }, select: { id: true } });
  const founders = await db.user.findMany({ where: { role: "FOUNDER", status: { not: "INACTIVE" } }, select: { id: true } });
  const why = reason === "LAST_DAY" ? "on their last day" : reason === "OFFBOARDED" ? "as they left" : "on request";
  await notify(
    founders.map((f) => f.id),
    {
      kind: "SYSTEM",
      actorId,
      title: `${data.person.name}'s work report is ready`,
      body: `Filed ${why}: ${data.stats.completed} of ${data.stats.total} tasks done, ${data.stats.onTimeRate === null ? "no deadlines yet" : `${data.stats.onTimeRate}% on time`}.`,
      href: `/people/${userId}/report`,
    },
  );
  return report.id;
}

/**
 * Files the report for everyone whose last day is today (or passed without
 * one). Run by the daily cron; safe to run repeatedly.
 */
export async function fileDueLastDayReports(tz: string, now = new Date()) {
  const today = dayKey(now, tz);
  const due = await db.user.findMany({
    where: { lastDay: { not: null, lte: new Date(now.getTime() + 24 * 3600_000) }, workReports: { none: { reason: { in: ["LAST_DAY", "OFFBOARDED"] } } } },
    select: { id: true, lastDay: true },
  });
  let filed = 0;
  for (const u of due) {
    if (dayKey(u.lastDay!, tz) > today) continue;
    await fileWorkReport(u.id, "LAST_DAY");
    filed += 1;
  }
  return filed;
}

/** When someone leaves: file the final report unless one was filed in the last day. */
export async function fileReportOnOffboarding(userId: string, actorId: string | null) {
  const recent = await db.workReport.findFirst({
    where: { userId, reason: { in: ["LAST_DAY", "OFFBOARDED"] }, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
    select: { id: true },
  });
  if (recent) return recent.id;
  return fileWorkReport(userId, "OFFBOARDED", actorId);
}
