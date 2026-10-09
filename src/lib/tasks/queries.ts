import type { Prisma } from "@/generated/prisma/client";
import { isFounder, type Actor } from "@/lib/permissions";

/** The Prisma filter matching exactly what `canViewTask` allows. */
export function taskVisibilityWhere(user: Actor, subordinateIds: Set<string>): Prisma.TaskWhereInput {
  if (isFounder(user)) return {};
  const or: Prisma.TaskWhereInput[] = [
    { createdById: user.id },
    { assignees: { some: { userId: user.id } } },
  ];
  if (subordinateIds.size) or.push({ assignees: { some: { userId: { in: [...subordinateIds] } } } });
  return { OR: or };
}

const personSelect = { id: true, firstName: true, lastName: true, avatarHue: true } as const;

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
  assignees: { select: { user: { select: personSelect } }, orderBy: { assignedAt: "asc" } },
  _count: { select: { attachments: true, activities: { where: { kind: { in: ["COMMENT", "PROGRESS_UPDATE"] } } } } },
  updateRequests: { where: { resolvedAt: null }, select: { id: true }, take: 1 },
} satisfies Prisma.TaskSelect;

export type TaskRowData = Prisma.TaskGetPayload<{ select: typeof taskRowSelect }>;

/** Serialisable row for client components. */
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
    attachments: t._count.attachments,
    comments: t._count.activities,
    awaitingUpdate: t.updateRequests.length > 0,
  };
}

export type ClientTaskRow = ReturnType<typeof toClientRow>;
