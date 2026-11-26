import "server-only";
import { db } from "@/lib/db";
import { assigneeOrder } from "@/lib/tasks/queries";

/**
 * A thread is a run of tasks that follow on from each other — plan, then
 * execute, then report. Every later step stores the first task's id in
 * `threadId`; the first task (and any standalone task) has none.
 *
 * Every step of the thread `taskId` belongs to, oldest first — in one query,
 * without knowing which task is the first: the task itself, the steps that
 * point at it, the task it points at, and that task's other steps.
 */
export function threadOf(taskId: string) {
  return db.task.findMany({
    where: {
      archivedAt: null,
      OR: [{ id: taskId }, { threadId: taskId }, { threadSteps: { some: { id: taskId } } }, { thread: { threadSteps: { some: { id: taskId } } } }],
    },
    orderBy: [{ createdAt: "asc" }, { number: "asc" }],
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      dueAt: true,
      createdById: true,
      assignees: { orderBy: assigneeOrder, select: { user: { select: { id: true, firstName: true, lastName: true, avatarHue: true, role: true } } } },
    },
  });
}

export type ThreadStep = Awaited<ReturnType<typeof threadOf>>[number];
