import type { Prisma } from "@/generated/prisma/client";
import { isFounder, type Actor, type GrantedOwnerIds } from "@/lib/permissions";

/** A task's creator and its assignees with their current roles: the input to `taskAccess`. */
export const taskAccessSelect = {
  createdById: true,
  assignees: { select: { userId: true, user: { select: { role: true } } } },
} satisfies Prisma.TaskSelect;

/**
 * Tasks shared through grants: one of the granted people is on the task and no
 * founder is. Also the "Shared with me" list on the tasks page.
 */
export function grantedWorkWhere(grantedOwnerIds: GrantedOwnerIds): Prisma.TaskWhereInput {
  return {
    AND: [
      { assignees: { some: { userId: { in: [...grantedOwnerIds] } } } },
      { assignees: { none: { user: { role: "FOUNDER" } } } },
    ],
  };
}

/**
 * The Prisma filter matching exactly what `canViewTask` allows. Founders see
 * everything; anyone else sees what they created or are on, and the work of
 * people a founder allowed them to see, except tasks a founder is on.
 */
export function taskVisibilityWhere(user: Pick<Actor, "id" | "role">, grantedOwnerIds: GrantedOwnerIds): Prisma.TaskWhereInput {
  if (isFounder(user)) return {};
  const or: Prisma.TaskWhereInput[] = [
    { createdById: user.id },
    { assignees: { some: { userId: user.id } } },
  ];
  if (grantedOwnerIds.size) or.push(grantedWorkWhere(grantedOwnerIds));
  return { OR: or };
}

/**
 * Notifications a person may still read: those about no task, and those about
 * a live task they can see now. Being taken off a task, or losing a grant,
 * hides what was sent about it.
 */
export function notificationVisibilityWhere(user: Pick<Actor, "id" | "role">, grantedOwnerIds: GrantedOwnerIds): Prisma.NotificationWhereInput {
  return {
    userId: user.id,
    OR: [{ taskId: null }, { task: { AND: [{ archivedAt: null }, taskVisibilityWhere(user, grantedOwnerIds)] } }],
  };
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
