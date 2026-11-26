import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { assigneeOrder } from "@/lib/tasks/queries";

const DAY = 24 * 3600_000;

const leaderWhere: Prisma.UserWhereInput = { role: { in: ["FOUNDER", "MANAGER"] }, status: { not: "INACTIVE" } };

const taskSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  dueAt: true,
  progress: true,
  assignees: { orderBy: assigneeOrder, select: { user: { select: { id: true, firstName: true, lastName: true, avatarHue: true } } } },
} as const;

/**
 * The leadership board: each founder's and manager's own open work, what
 * they've delegated, and their counts. Three queries in one round trip — every
 * open task a leader is on or handed out, the week's finished work, and the
 * leaders — split up per leader here rather than queried once per leader.
 */
export async function leadershipBoards(now = new Date()) {
  const [leaders, open, doneThisWeek] = await Promise.all([
    db.user.findMany({
      where: leaderWhere,
      orderBy: [{ role: "asc" }, { orgOrder: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
        role: true,
        avatarHue: true,
        focus: true,
        focusUpdatedAt: true,
        status: true,
        department: { select: { name: true, color: true } },
      },
    }),
    db.task.findMany({
      where: { archivedAt: null, status: { not: "DONE" }, OR: [{ assignees: { some: { user: leaderWhere } } }, { createdBy: leaderWhere }] },
      orderBy: { dueAt: "asc" },
      select: { ...taskSelect, createdById: true },
    }),
    db.task.findMany({
      where: { status: "DONE", completedAt: { gte: new Date(now.getTime() - 7 * DAY) }, assignees: { some: { user: leaderWhere } } },
      select: { assignees: { select: { userId: true } } },
    }),
  ]);

  const onIt = (t: (typeof open)[number], id: string) => t.assignees.some((a) => a.user.id === id);
  const lite = ({ id, number, title, status, dueAt, progress, assignees }: (typeof open)[number]) => ({ id, number, title, status, dueAt, progress, assignees });
  return leaders.map((leader) => {
    const mine = open.filter((t) => onIt(t, leader.id));
    const handedOut = open.filter((t) => t.createdById === leader.id && t.assignees.some((a) => a.user.id !== leader.id));
    return {
      leader,
      own: mine.slice(0, 6).map(lite),
      delegated: handedOut.slice(0, 5).map(lite),
      doneWeek: doneThisWeek.filter((t) => t.assignees.some((a) => a.userId === leader.id)).length,
      ownCount: mine.length,
      delegatedCount: handedOut.length,
      overdue: mine.filter((t) => t.status !== "IN_REVIEW" && t.dueAt < now).length,
    };
  });
}
