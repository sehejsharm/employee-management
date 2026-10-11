import type { Prisma } from "@/generated/prisma/client";
import { isFounder, type Actor } from "@/lib/permissions";

/**
 * The Prisma filter matching exactly what `canViewTask` allows: your own and
 * shared work, plus cleared colleagues' work that no founder is doing.
 */
export function taskVisibilityWhere(user: Actor, clearedIds: Set<string>): Prisma.TaskWhereInput {
  if (isFounder(user)) return {};
  const or: Prisma.TaskWhereInput[] = [{ createdById: user.id }, { assignees: { some: { userId: user.id } } }];
  if (clearedIds.size) {
    or.push({
      AND: [
        { assignees: { some: { userId: { in: [...clearedIds] } } } },
        { assignees: { none: { user: { role: "FOUNDER" } } } },
      ],
    });
  }
  return { OR: or };
}

const personSelect = { id: true, firstName: true, lastName: true, avatarHue: true } as const;

/** Lead first, then followers in the order they were added. */
export const assigneeOrder = [{ role: "asc" }, { assignedAt: "asc" }] satisfies Prisma.TaskAssigneeOrderByWithRelationInput[];

export const taskRowSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  dueAt: true,
  progress: true,
  completedAt: true,
  createdAt: true,
  createdById: true,
  createdBy: { select: personSelect },
  assignees: { select: { role: true, user: { select: personSelect } }, orderBy: assigneeOrder },
  _count: { select: { attachments: true, activities: { where: { kind: { in: ["COMMENT", "PROGRESS_UPDATE"] } } } } },
  updateRequests: { where: { resolvedAt: null }, select: { id: true }, take: 1 },
} satisfies Prisma.TaskSelect;

export type TaskRowData = Prisma.TaskGetPayload<{ select: typeof taskRowSelect }>;

/** Serialisable row for client components. Assignees are lead first. */
export function toClientRow(t: TaskRowData) {
  return {
    id: t.id,
    number: t.number,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt.toISOString(),
    progress: t.progress,
    createdById: t.createdById,
    createdBy: t.createdBy,
    assignees: t.assignees.map((a) => a.user),
    leadId: t.assignees.find((a) => a.role === "LEAD")?.user.id ?? t.assignees[0]?.user.id ?? null,
    attachments: t._count.attachments,
    comments: t._count.activities,
    awaitingUpdate: t.updateRequests.length > 0,
  };
}

export type ClientTaskRow = ReturnType<typeof toClientRow>;
