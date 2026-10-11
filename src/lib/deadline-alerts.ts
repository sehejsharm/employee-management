import type { NotificationKind } from "@/generated/prisma/enums";
import { formatCountdown } from "@/lib/time";
import { taskRef } from "@/lib/utils";

/**
 * Pure: decides which deadline reminders a set of open tasks deserves right
 * now. The caller stores them; the dedupe keys make storing them idempotent.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export interface AlertRow {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href?: string | null;
  taskId?: string | null;
  dedupeKey?: string | null;
}

/**
 * The reminder ladder: a nudge a day out, then 12 hours, 6 hours, 1 hour,
 * 30, 15 and 5 minutes before the deadline — for as long as the work hasn't
 * been submitted. Someone who was away gets only the latest rung, not a backlog.
 */
export const REMINDER_LADDER = [
  { key: "due24h", within: 24 * HOUR },
  { key: "due12h", within: 12 * HOUR },
  { key: "due6h", within: 6 * HOUR },
  { key: "due1h", within: 1 * HOUR },
  { key: "due30m", within: 30 * MINUTE },
  { key: "due15m", within: 15 * MINUTE },
  { key: "due5m", within: 5 * MINUTE },
] as const;

/** How far ahead the ladder starts; queries only need tasks due within this window. */
export const REMINDER_HORIZON_MS = REMINDER_LADDER[0].within;

/** Work in these states has been handed in (or finished), so reminders stop. */
export const SUBMITTED_STATUSES = ["IN_REVIEW", "DONE"] as const;

type Stage = (typeof REMINDER_LADDER)[number]["key"] | "overdue";

/** The rung a deadline is on right now, or null when it's still more than a day away. */
export function reminderStage(dueAt: Date, now: Date): Stage | null {
  const ms = dueAt.getTime() - now.getTime();
  if (ms <= 0) return "overdue";
  let stage: Stage | null = null;
  for (const rung of REMINDER_LADDER) if (ms <= rung.within) stage = rung.key;
  return stage;
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
 * Deadline reminders as idempotent rows: one per task, per person, per rung,
 * per deadline. The dedupe key carries the due timestamp, so moving a
 * deadline re-arms the reminders, and running this twice never doubles up.
 * Callers pass only work that hasn't been submitted yet.
 */
export function deadlineAlerts(tasks: OpenTask[], now: Date, onlyUserId?: string): AlertRow[] {
  const out: AlertRow[] = [];
  for (const task of tasks) {
    const stage = reminderStage(task.dueAt, now);
    if (!stage) continue;
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
        title: stage === "overdue" ? `${ref} is overdue` : `${ref} is due ${formatCountdown(task.dueAt, now)}`,
        body:
          stage === "overdue"
            ? `${task.title} — submit your work as soon as you can.`
            : `${task.title} — submit your work with proof before the deadline.`,
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
