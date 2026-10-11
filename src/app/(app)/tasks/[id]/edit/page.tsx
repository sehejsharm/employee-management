import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { TaskForm } from "@/components/tasks/task-form";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { canAssignTasks, canEditTask } from "@/lib/permissions";
import { pickablePeople } from "@/lib/people";
import { assigneeOrder } from "@/lib/tasks/queries";
import { taskRef } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit task" };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const task = await db.task.findFirst({
    where: { id, archivedAt: null },
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      priority: true,
      dueAt: true,
      createdById: true,
      assignees: { select: { userId: true, role: true }, orderBy: assigneeOrder },
    },
  });
  if (!task) notFound();
  const assigneeIds = task.assignees.map((a) => a.userId);
  if (!canEditTask(user, { createdById: task.createdById })) notFound();
  const people = await pickablePeople();

  return (
    <>
      <PageHeader eyebrow={taskRef(task.number)} title="Edit task" description="Changes to the deadline, the lead or the followers notify the people involved." />
      <TaskForm
        people={people}
        selfId={user.id}
        canAssignOthers={canAssignTasks(user)}
        maxUploadBytes={config.maxUploadBytes()}
        initial={{
          id: task.id,
          title: task.title,
          description: task.description ?? "",
          priority: task.priority,
          dueAt: task.dueAt.toISOString(),
          assigneeIds,
          leadId: task.assignees.find((a) => a.role === "LEAD")?.userId ?? assigneeIds[0],
        }}
      />
    </>
  );
}
