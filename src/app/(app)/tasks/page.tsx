import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { TasksView, type Scope } from "@/components/tasks/tasks-view";
import { getSubordinateIds, requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { canAssignTasks, isFounder } from "@/lib/permissions";
import { taskRowSelect, toClientRow } from "@/lib/tasks/queries";
import { getTimeZone } from "@/lib/tz.server";

export const metadata: Metadata = { title: "Tasks" };

type ScopeKey = "mine" | "delegated" | "team" | "all";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ scope?: string; view?: string }> }) {
  const user = await requireUser();
  const tz = await getTimeZone();
  const params = await searchParams;
  const subs = await getSubordinateIds(user.id);

  const filters: Partial<Record<ScopeKey, Prisma.TaskWhereInput>> = {
    mine: { assignees: { some: { userId: user.id } } },
  };
  if (canAssignTasks(user)) {
    filters.delegated = { createdById: user.id, assignees: { some: { userId: { not: user.id } } } };
  }
  if (!isFounder(user) && subs.size) {
    filters.team = { assignees: { some: { userId: { in: [...subs] } } } };
  }
  if (isFounder(user)) filters.all = {};

  const labels: Record<ScopeKey, string> = {
    mine: "Assigned to me",
    delegated: "Assigned by me",
    team: "My team",
    all: "Everyone",
  };

  const keys = Object.keys(filters) as ScopeKey[];
  const scope: ScopeKey = keys.includes(params.scope as ScopeKey) ? (params.scope as ScopeKey) : "mine";
  const view = params.view === "board" || params.view === "calendar" ? params.view : "list";

  const base: Prisma.TaskWhereInput = { archivedAt: null };
  const [rows, ...counts] = await Promise.all([
    db.task.findMany({
      where: { ...base, ...filters[scope] },
      select: taskRowSelect,
      orderBy: { dueAt: "asc" },
      take: 600,
    }),
    ...keys.map((k) => db.task.count({ where: { ...base, ...filters[k], status: { not: "DONE" } } })),
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
