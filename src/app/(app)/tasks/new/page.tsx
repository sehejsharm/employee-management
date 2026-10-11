import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { TaskForm } from "@/components/tasks/task-form";
import { requireUser } from "@/lib/auth/current-user";
import { config } from "@/lib/env";
import { canAssignTasks } from "@/lib/permissions";
import { pickablePeople } from "@/lib/people";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const user = await requireUser();
  const people = await pickablePeople(user);
  const { for: presetFor } = await searchParams;
  const canAssign = canAssignTasks(user);
  const preset = canAssign && people.some((p) => p.id === presetFor) ? presetFor : undefined;

  return (
    <>
      <PageHeader
        eyebrow="New task"
        title={canAssign ? "Assign work" : "Add a task for yourself"}
        description="Give it a clear title, a real deadline, and everything they need to get it done."
      />
      <TaskForm
        people={people}
        selfId={user.id}
        canAssignOthers={canAssign}
        maxUploadBytes={config.maxUploadBytes()}
        presetAssignee={preset}
      />
    </>
  );
}
