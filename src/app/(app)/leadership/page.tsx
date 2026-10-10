import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Lock, Send, Target } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Stagger, StaggerItem } from "@/components/motion";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { DepartmentTag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-ring";
import { DueLabel } from "@/components/tasks/badges";
import { STATUS_META } from "@/components/tasks/meta";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { isFounder, isLeader } from "@/lib/permissions";
import { timeAgo } from "@/lib/time";
import { getTimeZone } from "@/lib/tz.server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leadership" };

const DAY = 24 * 3600_000;

const taskSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  dueAt: true,
  progress: true,
  assignees: { select: { user: { select: { id: true, firstName: true, lastName: true, avatarHue: true } } } },
} as const;

/**
 * Who in leadership is carrying what. Founders see every task; management
 * sees the shape of the work (focus and counts) without the task details.
 */
export default async function LeadershipPage() {
  const user = await requireUser();
  if (!isLeader(user)) notFound();
  const tz = await getTimeZone();
  const detailed = isFounder(user);
  const now = new Date();

  const leaders = await db.user.findMany({
    where: { role: { in: ["FOUNDER", "MANAGER"] }, status: { not: "INACTIVE" } },
    orderBy: [{ role: "asc" }, { orgOrder: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      title: true,
      role: true,
      avatarHue: true,
      focus: true,
      focusUpdatedAt: true,
      status: true,
      department: { select: { name: true, color: true } },
    },
  });

  const boards = await Promise.all(
    leaders.map(async (l) => {
      const [own, delegated, doneWeek] = await Promise.all([
        db.task.findMany({
          where: { archivedAt: null, status: { not: "DONE" }, assignees: { some: { userId: l.id } } },
          orderBy: { dueAt: "asc" },
          take: 6,
          select: taskSelect,
        }),
        db.task.findMany({
          where: { archivedAt: null, status: { not: "DONE" }, createdById: l.id, assignees: { some: { userId: { not: l.id } } } },
          orderBy: { dueAt: "asc" },
          take: 5,
          select: taskSelect,
        }),
        db.task.count({
          where: { status: "DONE", completedAt: { gte: new Date(now.getTime() - 7 * DAY) }, assignees: { some: { userId: l.id } } },
        }),
      ]);
      const [ownCount, delegatedCount, overdue] = await Promise.all([
        db.task.count({ where: { archivedAt: null, status: { not: "DONE" }, assignees: { some: { userId: l.id } } } }),
        db.task.count({ where: { archivedAt: null, status: { not: "DONE" }, createdById: l.id, assignees: { some: { userId: { not: l.id } } } } }),
        db.task.count({ where: { archivedAt: null, status: { not: "DONE" }, dueAt: { lt: now }, assignees: { some: { userId: l.id } } } }),
      ]);
      return { leader: l, own, delegated, doneWeek, ownCount, delegatedCount, overdue };
    }),
  );

  const founders = boards.filter((b) => b.leader.role === "FOUNDER");
  const managers = boards.filter((b) => b.leader.role === "MANAGER");

  return (
    <>
      <PageHeader
        eyebrow="Leadership"
        title="Who's carrying what"
        description="Each founder's and lead's own work, what they've delegated, and what they're focused on — so nobody has to ask."
      />
      {!detailed && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-[13px] text-fg-muted">
          <Lock className="size-4 text-fg-subtle" /> Task details on this board are visible to founders. You&apos;re seeing focus and workload.
        </div>
      )}

      <Section title="Founders" boards={founders} detailed={detailed} tz={tz} meId={user.id} />
      {managers.length > 0 && <Section title="Management" boards={managers} detailed={detailed} tz={tz} meId={user.id} />}
    </>
  );
}

interface Board {
  leader: {
    id: string;
    firstName: string;
    lastName: string;
    title: string | null;
    role: string;
    avatarHue: number;
    focus: string | null;
    focusUpdatedAt: Date | null;
    status: string;
    department: { name: string; color: string } | null;
  };
  own: TaskLite[];
  delegated: TaskLite[];
  doneWeek: number;
  ownCount: number;
  delegatedCount: number;
  overdue: number;
}

interface TaskLite {
  id: string;
  number: number;
  title: string;
  status: keyof typeof STATUS_META;
  dueAt: Date;
  progress: number;
  assignees: { user: { id: string; firstName: string; lastName: string; avatarHue: number } }[];
}

function Section({ title, boards, detailed, tz, meId }: { title: string; boards: Board[]; detailed: boolean; tz: string; meId: string }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">{title}</h2>
      <Stagger className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {boards.map((b) => (
          <StaggerItem key={b.leader.id}>
            <LeaderCard board={b} detailed={detailed} tz={tz} isMe={b.leader.id === meId} />
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}

function LeaderCard({ board, detailed, tz, isMe }: { board: Board; detailed: boolean; tz: string; isMe: boolean }) {
  const { leader } = board;
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
      <div className="relative overflow-hidden border-b border-line p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_0%_0%,var(--brand-soft),transparent_60%)]" />
        <div className="relative flex items-start gap-4">
          <Avatar person={leader} size="lg" />
          <div className="min-w-0 flex-1">
            <Link href={`/people/${leader.id}`} className="group inline-flex items-center gap-1 text-[16px] font-semibold tracking-tight hover:text-brand">
              {leader.firstName} {leader.lastName}
              {isMe && <span className="text-[12px] font-normal text-fg-subtle">(you)</span>}
              <ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
            </Link>
            <div className="text-[13px] text-fg-muted">{leader.title}</div>
            {leader.department && <DepartmentTag name={leader.department.name} color={leader.department.color} className="mt-1" />}
          </div>
          {!isMe && (
            <Button asChild variant="secondary" size="xs">
              <Link href={`/tasks/new?for=${leader.id}`}>
                <Send /> Assign
              </Link>
            </Button>
          )}
        </div>
        <div className="relative mt-4 rounded-xl border border-line bg-surface/80 px-3.5 py-2.5 text-[13px] backdrop-blur">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
            <Target className="size-3" /> Focus
            {leader.focusUpdatedAt && (
              <span className="font-normal normal-case tracking-normal text-fg-subtle" suppressHydrationWarning>
                · {timeAgo(leader.focusUpdatedAt)}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-fg">{leader.focus ?? <span className="text-fg-subtle">Nothing shared yet.</span>}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-line border-b border-line text-center">
        {[
          ["Own open", board.ownCount, ""],
          ["Overdue", board.overdue, board.overdue ? "text-danger" : ""],
          ["Delegated", board.delegatedCount, ""],
          ["Done · 7d", board.doneWeek, board.doneWeek ? "text-success" : ""],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="px-2 py-3">
            <div className={cn("text-[20px] font-semibold tabular tracking-tight", tone as string)}>{value}</div>
            <div className="text-[11px] text-fg-subtle">{label}</div>
          </div>
        ))}
      </div>

      {detailed ? (
        <div className="flex-1 space-y-5 p-5">
          <TaskList title="Working on" tasks={board.own} tz={tz} empty="No open tasks of their own." />
          <TaskList title="Delegated" tasks={board.delegated} tz={tz} empty="Nothing delegated right now." showAssignees />
        </div>
      ) : (
        <div className="flex-1 p-5 text-[13px] text-fg-subtle">Task details are visible to founders.</div>
      )}
    </article>
  );
}

function TaskList({ title, tasks, tz, empty, showAssignees }: { title: string; tasks: TaskLite[]; tz: string; empty: string; showAssignees?: boolean }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{title}</div>
      {tasks.length === 0 ? (
        <p className="text-[13px] text-fg-subtle">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((t) => {
            const m = STATUS_META[t.status];
            return (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`} className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-surface-hover">
                  <m.icon className={cn("size-4 shrink-0", m.iconClass)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium group-hover:text-brand">{t.title}</div>
                    {t.progress > 0 && <ProgressBar value={t.progress} className="mt-1.5 h-1 w-24" />}
                  </div>
                  {showAssignees && <AvatarStack people={t.assignees.map((a) => a.user)} max={2} size="xs" />}
                  <DueLabel dueAt={t.dueAt.toISOString()} status={t.status} tz={tz} className="text-[11.5px]" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
