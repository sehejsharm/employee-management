import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { TaskForm } from "@/components/tasks/task-form";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { canAssignTasks, isFounder, isInvolved } from "@/lib/permissions";
import { pickablePeople } from "@/lib/people";
import { taskRef } from "@/lib/utils";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ for?: string; after?: string }> }) {
  const [user, { for: presetFor, after }] = await Promise.all([requireUser(), searchParams]);
  const [people, previous] = await Promise.all([
    pickablePeople(),
    // "Add next step" on a task: the new task continues that one's thread.
    after
      ? db.task.findFirst({
          where: { id: after, archivedAt: null },
          select: { id: true, number: true, title: true, createdById: true, assignees: { orderBy: { role: "asc" }, select: { userId: true } } },
        })
      : null,
  ]);
  const canAssign = canAssignTasks(user);
  const preset = canAssign && people.some((p) => p.id === presetFor) ? presetFor : undefined;
  // Only someone working on the earlier task (or a founder) can continue it; the action re-checks.
  const continues =
    previous && (isFounder(user) || isInvolved(user, { createdById: previous.createdById, assigneeIds: previous.assignees.map((a) => a.userId) }))
      ? previous
      : null;
  // The next step starts with the same team (people who have since left are dropped).
  const team = continues && canAssign ? continues.assignees.map((a) => a.userId).filter((id) => people.some((p) => p.id === id)) : undefined;

  return (
    <>
      <PageHeader
        eyebrow={continues ? "Next step" : "New task"}
        title={continues ? "Continue the thread" : canAssign ? "Assign work" : "Add a task for yourself"}
        description={
          continues
            ? "Add what comes next — for example, executing what was just planned. It stays linked to the earlier task."
            : "Give it a clear title, a real deadline, and everything they need to get it done."
        }
      />
      <TaskForm
        people={people}
        selfId={user.id}
        canAssignOthers={canAssign}
        maxUploadBytes={config.maxUploadBytes()}
        presetAssignee={preset}
        presetAssignees={team}
        continues={continues ? { id: continues.id, ref: taskRef(continues.number), title: continues.title } : undefined}
        canRepeat={isFounder(user)}
      />
    </>
  );
}
