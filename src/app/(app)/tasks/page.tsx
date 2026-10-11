import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { TasksView, type Scope } from "@/components/tasks/tasks-view";
import { getGrantedOwnerIds, requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { canAssignTasks, isFounder } from "@/lib/permissions";
import { grantedWorkWhere, taskRowSelect, taskVisibilityWhere, toClientRow } from "@/lib/tasks/queries";
import { getTimeZone } from "@/lib/tz.server";

export const metadata: Metadata = { title: "Tasks" };

type ScopeKey = "mine" | "delegated" | "shared" | "all";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ scope?: string; view?: string }> }) {
  const user = await requireUser();
  const tz = await getTimeZone();
  const params = await searchParams;
  const granted = await getGrantedOwnerIds(user);

  const filters: Partial<Record<ScopeKey, Prisma.TaskWhereInput>> = {
    mine: { assignees: { some: { userId: user.id } } },
  };
  if (canAssignTasks(user)) {
    filters.delegated = { createdById: user.id, assignees: { some: { userId: { not: user.id } } } };
  }
  // The work of people a founder has allowed this person to see.
  if (!isFounder(user) && granted.size) filters.shared = grantedWorkWhere(granted);
  if (isFounder(user)) filters.all = {};

  const labels: Record<ScopeKey, string> = {
    mine: "Assigned to me",
    delegated: "Assigned by me",
    shared: "Shared with me",
    all: "Everyone",
  };

  const keys = Object.keys(filters) as ScopeKey[];
  const scope: ScopeKey = keys.includes(params.scope as ScopeKey) ? (params.scope as ScopeKey) : "mine";
  const view = params.view === "board" || params.view === "calendar" ? params.view : "list";

  // Every scope is narrowed to what this person may see, so no tab can widen it.
  const base: Prisma.TaskWhereInput = { AND: [{ archivedAt: null }, taskVisibilityWhere(user, granted)] };
  const [rows, ...counts] = await Promise.all([
    db.task.findMany({
      where: { AND: [base, filters[scope]!] },
      select: taskRowSelect,
      orderBy: { dueAt: "asc" },
      take: 600,
    }),
    ...keys.map((k) => db.task.count({ where: { AND: [base, filters[k]!, { status: { not: "DONE" } }] } })),
  ]);

  const scopes: Scope[] = keys.map((k, i) => ({ key: k, label: labels[k], count: counts[i] }));

  return (
    <>
      <PageHeader
        eyebrow="Work"
        title="Tasks"
        description="Everything with your name on it, every deadline in your time zone."
        actions={
          <Button asChild>
            <Link href="/tasks/new">
              <Plus /> New task
            </Link>
          </Button>
        }
      />
      <TasksView
        tasks={rows.map(toClientRow)}
        tz={tz}
        userId={user.id}
        isFounder={isFounder(user)}
        scopes={scopes}
        scope={scope}
        initialView={view}
      />
    </>
  );
}
