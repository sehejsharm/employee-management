import type { NotificationKind } from "@/generated/prisma/enums";
import { DUE_URGENT_HOURS, formatCountdown } from "@/lib/time";
import { taskRef } from "@/lib/utils";

/**
 * Pure: decides which deadline reminders a set of open tasks deserves right
 * now. The caller stores them; the dedupe keys make storing them idempotent.
 */

const HOUR = 60 * 60 * 1000;

export interface AlertRow {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
  taskId?: string | null;
  dedupeKey?: string | null;
}

type Stage = "due24" | "due2" | "overdue";

function stageFor(dueAt: Date, now: Date): Stage {
  const ms = dueAt.getTime() - now.getTime();
  if (ms <= 0) return "overdue";
  if (ms <= DUE_URGENT_HOURS * HOUR) return "due2";
  return "due24";
}

export interface OpenTask {
  id: string;
  number: number;
  title: string;
  dueAt: Date;
  createdById: string;
  assignees: { userId: string; user: { firstName: string } }[];
}

/**
 * Deadline reminders as idempotent rows: one per task, per person, per stage,
 * per deadline. The dedupe key carries the due timestamp, so moving a
 * deadline re-arms the reminders, and running this twice never doubles up.
 */
export function deadlineAlerts(tasks: OpenTask[], now: Date, onlyUserId?: string): AlertRow[] {
  const out: AlertRow[] = [];
  for (const task of tasks) {
    const stage = stageFor(task.dueAt, now);
    const due = task.dueAt.getTime();
    const ref = taskRef(task.number);
    const href = `/tasks/${task.id}`;

    for (const { userId } of task.assignees) {
      if (onlyUserId && userId !== onlyUserId) continue;
      out.push({
        userId,
        taskId: task.id,
        href,
        kind: stage === "overdue" ? "TASK_OVERDUE" : "TASK_DUE_SOON",
        title:
          stage === "overdue"
            ? `${ref} is overdue`
            : stage === "due2"
              ? `${ref} is due ${formatCountdown(task.dueAt, now)}`
              : `${ref} is due within a day`,
        body: task.title,
        dedupeKey: `${stage}:${task.id}:${due}`,
      });
    }

    // Whoever assigned the work hears about it once it slips.
    const creatorIsAssignee = task.assignees.some((a) => a.userId === task.createdById);
    if (stage === "overdue" && !creatorIsAssignee && (!onlyUserId || onlyUserId === task.createdById)) {
      const names = task.assignees.map((a) => a.user.firstName).join(", ");
      out.push({
        userId: task.createdById,
        taskId: task.id,
        href,
        kind: "TASK_OVERDUE",
        title: `${ref} has slipped past its deadline`,
        body: names ? `${task.title} — assigned to ${names}` : task.title,
        dedupeKey: `overdue-owner:${task.id}:${due}`,
      });
    }
  }
  return out;
}

