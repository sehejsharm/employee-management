import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, ClipboardList, Hash, Mail, MapPin, Phone, Send, Target, UsersRound } from "lucide-react";
import { FadeIn } from "@/components/motion";
import { Avatar } from "@/components/ui/avatar";
import { Badge, DepartmentTag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ManageMember } from "@/components/people/manage-member";
import { TaskRow } from "@/components/tasks/task-row";
import { requireUser } from "@/lib/auth/current-user";
import { canSeeWorkOf, clearanceBlock, getClearedIds, pendingClearanceWaitingOn } from "@/lib/clearance";
import { NoClearance } from "@/components/clearance/no-clearance";
import { db } from "@/lib/db";
import { ROLE_LABEL, STATUS_LABEL, canAssignTasks, canManagePeople, isFounder } from "@/lib/permissions";
import { taskRowSelect, taskVisibilityWhere, toClientRow } from "@/lib/tasks/queries";
import { formatDate, timeAgo } from "@/lib/time";
import { getTimeZone } from "@/lib/tz.server";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await db.user.findUnique({ where: { id }, select: { firstName: true, lastName: true } });
  return { title: p ? `${p.firstName} ${p.lastName}` : "Person" };
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser();
  const tz = await getTimeZone();
  const { id } = await params;

  const person = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      employeeCode: true,
      title: true,
      role: true,
      status: true,
      phone: true,
      location: true,
      bio: true,
      focus: true,
      focusUpdatedAt: true,
      avatarHue: true,
      joinedAt: true,
      source: true,
      canAssignTasks: true,
      canManageOrg: true,
      canManagePeople: true,
      departmentId: true,
      managerId: true,
      department: { select: { name: true, color: true } },
      manager: { select: { id: true, firstName: true, lastName: true, title: true, avatarHue: true } },
      reports: {
        where: { status: { not: "INACTIVE" } },
        orderBy: { firstName: "asc" },
        select: { id: true, firstName: true, lastName: true, title: true, avatarHue: true, status: true },
      },
    },
  });
  if (!person) notFound();

  const isSelf = viewer.id === person.id;
  const cleared = await getClearedIds(viewer);
  const admin = canManagePeople(viewer);
  // Someone's work — their task list and their focus — needs clearance; founders' work is founders-only.
  const canSeeWork = canSeeWorkOf(viewer, person, cleared);
  const block = canSeeWork ? null : clearanceBlock(person);
  const waitingOn = block?.requestable ? await pendingClearanceWaitingOn(viewer.id, person) : null;
  if (!canSeeWork) {
    person.focus = null;
    person.focusUpdatedAt = null;
  }

  // Only the tasks the viewer is already allowed to see (without clearance: just the ones you share).
  const tasks = await db.task.findMany({
    where: {
      AND: [taskVisibilityWhere(viewer, cleared), { archivedAt: null, status: { not: "DONE" }, assignees: { some: { userId: person.id } } }],
    },
    select: taskRowSelect,
    orderBy: { dueAt: "asc" },
    take: 12,
  });

  const [departments, managers] = admin
    ? await Promise.all([
        db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.user.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
      ])
    : [[], []];

  const former = person.status === "INACTIVE";

  return (
    <FadeIn>
      <Link href="/people" className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted transition hover:text-fg">
        <ChevronLeft className="size-4" /> People
      </Link>

      <div className="relative mb-6 overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
        <div className="relative h-28 sm:h-36">
          <div className="absolute inset-0 bg-brand-gradient" />
          <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:18px_18px]" />
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:px-8 sm:pb-6">
          <Avatar person={person} size="xl" ring className="-mt-12 ring-4 sm:-mt-14" dimmed={former} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[24px] font-semibold tracking-[-0.02em] sm:text-[28px]">
                {person.firstName} {person.lastName}
              </h1>
              <Badge tone={person.role === "FOUNDER" ? "brandSolid" : person.role === "MANAGER" ? "brand" : "neutral"}>{ROLE_LABEL[person.role]}</Badge>
              {person.status !== "ACTIVE" && <Badge tone={former ? "neutral" : "warning"}>{STATUS_LABEL[person.status]}</Badge>}
            </div>
            <p className="mt-0.5 text-[14.5px] text-fg-muted">{person.title ?? ROLE_LABEL[person.role]}</p>
            {person.department && <DepartmentTag name={person.department.name} color={person.department.color} className="mt-1.5" />}
          </div>
          <div className="flex gap-2">
            {!isSelf && !former && canAssignTasks(viewer) && (
              <Button asChild>
                <Link href={`/tasks/new?for=${person.id}`}>
                  <Send /> Assign a task
                </Link>
              </Button>
            )}
            {isSelf && (
              <Button asChild variant="secondary">
                <Link href="/settings">Edit profile</Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-3.5 pt-5 text-[13.5px]">
              <Detail icon={<Hash />} label="Employee ID" value={<span className="font-mono">{person.employeeCode}</span>} />
              <Detail icon={<Mail />} label="Email" value={<a href={`mailto:${person.email}`} className="text-brand hover:underline">{person.email}</a>} />
              {person.phone && <Detail icon={<Phone />} label="Phone" value={<a href={`tel:${person.phone}`} className="hover:text-brand">{person.phone}</a>} />}
              {person.location && <Detail icon={<MapPin />} label="Location" value={person.location} />}
              {person.joinedAt && <Detail icon={<CalendarDays />} label="Joined" value={formatDate(person.joinedAt, tz, { year: true })} />}
            </CardBody>
          </Card>

          {(person.focus || person.bio) && (
            <Card>
              <CardBody className="space-y-4 pt-5">
                {person.focus && (
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
                      <Target className="size-3" /> Focused on
                    </div>
                    <p className="mt-1 text-[14px]">{person.focus}</p>
                    {person.focusUpdatedAt && (
                      <p className="mt-0.5 text-xs text-fg-subtle" suppressHydrationWarning>
                        Updated {timeAgo(person.focusUpdatedAt)}
                      </p>
                    )}
                  </div>
                )}
                {person.bio && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">About</div>
                    <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-muted">{person.bio}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader icon={<UsersRound />} title="Reporting line" />
            <CardBody className="space-y-4">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Reports to</div>
                {person.manager ? (
                  <PersonLink p={person.manager} />
                ) : (
                  <p className="text-[13px] text-fg-subtle">{person.role === "FOUNDER" ? "Founder — top of the organisation" : "No one yet"}</p>
                )}
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  Direct reports {person.reports.length > 0 && `· ${person.reports.length}`}
                </div>
                {person.reports.length === 0 ? (
                  <p className="text-[13px] text-fg-subtle">None</p>
                ) : (
                  <div className="space-y-2">
                    {person.reports.map((r) => (
                      <PersonLink key={r.id} p={r} />
                    ))}
                  </div>
                )}
              </div>
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href="/org">See on the org chart</Link>
              </Button>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              icon={<ClipboardList />}
              title={isSelf ? "Your open work" : block ? `Work you share with ${person.firstName}` : `${person.firstName}'s open work`}
              description={isSelf || isFounder(viewer) ? undefined : block ? undefined : "Shown with clearance from a founder."}
            />
            <CardBody className="px-2 sm:px-3">
              {block && (
                <NoClearance
                  subject={person}
                  reason={block.reason}
                  requestable={block.requestable}
                  pending={waitingOn}
                  canRequest={!isFounder(viewer)}
                  className={tasks.length ? "border-b border-line pb-6" : undefined}
                />
              )}
              {tasks.length === 0 ? (
                !block && <EmptyState icon={<ClipboardList />} title="Nothing to show" description="No open tasks right now." compact />
              ) : (
                <ul className={block ? "pt-3" : undefined}>
                  {tasks.map((t, i) => (
                    <TaskRow key={t.id} task={toClientRow(t)} tz={tz} index={i} canChangeStatus={false} />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {admin && (
            <ManageMember
              member={{
                id: person.id,
                firstName: person.firstName,
                email: person.email,
                employeeCode: person.employeeCode,
                role: person.role,
                title: person.title,
                status: person.status,
                departmentId: person.departmentId,
                managerId: person.managerId,
                canAssignTasks: person.canAssignTasks,
                canManageOrg: person.canManageOrg,
                canManagePeople: person.canManagePeople,
                source: person.source,
              }}
              departments={departments}
              managers={managers.map((m) => ({ id: m.id, name: `${m.firstName} ${m.lastName}` }))}
              actorIsFounder={isFounder(viewer)}
              isSelf={isSelf}
            />
          )}
        </div>
      </div>
    </FadeIn>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-fg-subtle [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11.5px] text-fg-subtle">{label}</div>
        <div className="truncate">{value}</div>
      </div>
    </div>
  );
}

function PersonLink({ p }: { p: { id: string; firstName: string; lastName: string; title: string | null; avatarHue: number } }) {
  return (
    <Link href={`/people/${p.id}`} className="group flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-surface-hover">
      <Avatar person={p} size="md" />
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-medium group-hover:text-brand">
          {p.firstName} {p.lastName}
        </div>
        <div className="truncate text-xs text-fg-subtle">{p.title}</div>
      </div>
    </Link>
  );
}
