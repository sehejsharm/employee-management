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
import { SharedEmailNotice } from "@/components/people/shared-email-notice";
import { ChangeEmailDialog } from "@/components/people/change-email-dialog";
import { isAboveInReportingLine, wouldCreateCycle } from "@/lib/org";
import { reportingEdges } from "@/lib/reporting";
import { AdditionalManagersEditor } from "@/components/org/additional-managers";
import { MeetNowButton, RequestFounderDialog, ScheduleMeetingDialog } from "@/components/calendar/meeting-dialogs";
import { teamConnection } from "@/lib/google/calendar";
import { googleConfig } from "@/lib/google/config";
import { pickablePeople } from "@/lib/people";
import { Award, CalendarPlus, FileText } from "lucide-react";
import { GiveRecognitionDialog, RecognitionCard } from "@/components/recognition/recognition";
import { recognitionFeed } from "@/lib/recognition-feed";
import { sharingEmailWith } from "@/lib/shared-email";
import { db } from "@/lib/db";
import { ROLE_LABEL, STATUS_LABEL, canAssignTasks, canChangeEmail, canManageOrg, canManagePeople, isFounder, isLeader } from "@/lib/permissions";
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
      emailSetManuallyAt: true,
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
      additionalManagers: {
        orderBy: { createdAt: "asc" },
        select: { manager: { select: { id: true, firstName: true, lastName: true, title: true, avatarHue: true, status: true } } },
      },
      additionalReports: {
        where: { user: { status: { not: "INACTIVE" } } },
        select: { user: { select: { id: true, firstName: true, lastName: true, title: true, avatarHue: true, status: true } } },
      },
    },
  });
  if (!person) notFound();

  const isSelf = viewer.id === person.id;
  // Meetings: anyone can call or schedule with a colleague once the team calendar is connected; founders take requests.
  const team = googleConfig.configured() ? await teamConnection() : null;
  const teamReady = !!team && !team.lastError;
  const meetable = !isSelf && person.status !== "INACTIVE";
  const meetPeople = meetable ? await pickablePeople() : [];
  const recognitions = await recognitionFeed(viewer, { recipientId: person.id }, 6);
  const recognitionCount = await db.recognition.count({ where: { recipientId: person.id } });
  const founderConn = meetable && person.role === "FOUNDER" ? await db.googleConnection.findUnique({ where: { userId: person.id }, select: { lastError: true } }) : null;
  const emailSharers = person.status === "INACTIVE" ? [] : await sharingEmailWith(person);
  // Founders, people admins and anyone this person reports to (directly or further up) can change their email.
  const orgEdges = await reportingEdges();
  const emailEditable = canChangeEmail(viewer, person, isAboveInReportingLine(orgEdges, viewer.id, person.id));
  // Everyone they report to: the main manager first, then any additional bosses.
  const otherBosses = person.additionalManagers.map((a) => a.manager).filter((m) => m.status !== "INACTIVE");
  const reportIds = new Set(person.reports.map((r) => r.id));
  const alsoReports = person.additionalReports.map((a) => a.user).filter((u) => !reportIds.has(u.id));
  const directReports = [...person.reports.map((r) => ({ ...r, also: false })), ...alsoReports.map((r) => ({ ...r, also: true }))];
  // Founders (and whoever they allow to edit the org chart) can add a second boss; only founders for a founder.
  const bossesEditable = canManageOrg(viewer) && person.status !== "INACTIVE" && (person.role !== "FOUNDER" || isFounder(viewer));
  const bossCandidates = bossesEditable
    ? (
        await db.user.findMany({
          where: { status: { not: "INACTIVE" }, id: { notIn: [person.id, ...(person.managerId ? [person.managerId] : []), ...otherBosses.map((b) => b.id)] } },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
          select: { id: true, firstName: true, lastName: true, title: true, avatarHue: true },
        })
      ).filter((c) => !wouldCreateCycle(orgEdges, person.id, c.id))
    : [];
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
          <div className="flex flex-wrap gap-2">
            {meetable && <MeetNowButton userId={person.id} firstName={person.firstName} disabled={!teamReady} />}
            {meetable && person.role === "FOUNDER" && (
              <RequestFounderDialog
                founders={[{ id: person.id, firstName: person.firstName, lastName: person.lastName, title: person.title, calendarConnected: !!founderConn && !founderConn.lastError }]}
                initialFounderId={person.id}
                trigger={
                  <Button variant="soft">
                    Request a meeting
                  </Button>
                }
              />
            )}
            {meetable && (
              <ScheduleMeetingDialog
                people={meetPeople}
                selfId={viewer.id}
                initialIds={[person.id]}
                trigger={
                  <Button variant="secondary" disabled={!teamReady}>
                    <CalendarPlus /> Schedule
                  </Button>
                }
              />
            )}
            {!isSelf && !former && canAssignTasks(viewer) && (
              <Button asChild>
                <Link href={`/tasks/new?for=${person.id}`}>
                  <Send /> Assign a task
                </Link>
              </Button>
            )}
            {meetable && (
              <GiveRecognitionDialog
                people={[{ id: person.id, name: `${person.firstName} ${person.lastName}`, title: person.title }]}
                canAward={isLeader(viewer)}
                initialRecipientId={person.id}
                trigger={
                  <Button variant="secondary">
                    <Award /> Recognise
                  </Button>
                }
              />
            )}
            {isFounder(viewer) && !isSelf && (
              <Button asChild variant="secondary">
                <Link href={`/people/${person.id}/report`}>
                  <FileText /> Work report
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
          <SharedEmailNotice email={person.email} others={emailSharers} self={isSelf} name={person.firstName} />
          <Card>
            <CardBody className="space-y-3.5 pt-5 text-[13.5px]">
              <Detail icon={<Hash />} label="Employee ID" value={<span className="font-mono">{person.employeeCode}</span>} />
              <Detail
                icon={<Mail />}
                label="Email"
                value={
                  <span className="break-all">
                    <a href={`mailto:${person.email}`} className="text-brand hover:underline">{person.email}</a>
                    {emailEditable && (
                      <ChangeEmailDialog
                        userId={person.id}
                        firstName={person.firstName}
                        email={person.email}
                        fromHr={person.source === "HR_CONSOLE"}
                        setManually={!!person.emailSetManuallyAt}
                      />
                    )}
                    {emailSharers.length > 0 && (
                      <Link href="/people/emails" className="ml-1.5 whitespace-nowrap rounded-full bg-info-soft px-1.5 text-[11px] font-semibold text-info">
                        Shared · {emailSharers.length + 1}
                      </Link>
                    )}
                  </span>
                }
              />
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
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  Reports to {otherBosses.length > 0 && `· ${otherBosses.length + (person.manager ? 1 : 0)}`}
                </div>
                {person.manager || otherBosses.length ? (
                  <div className="space-y-2">
                    {person.manager && <PersonLink p={person.manager} tag={otherBosses.length ? "Main" : undefined} />}
                    {!bossesEditable && otherBosses.map((b) => <PersonLink key={b.id} p={b} tag="Also" />)}
                  </div>
                ) : (
                  <p className="text-[13px] text-fg-subtle">{person.role === "FOUNDER" ? "Founder — top of the organisation" : "No one yet"}</p>
                )}
                {bossesEditable && (
                  <div className="mt-3">
                    <div className="mb-1.5 text-[11.5px] text-fg-subtle">Also reports to</div>
                    <AdditionalManagersEditor personId={person.id} personFirstName={person.firstName} current={otherBosses} candidates={bossCandidates} />
                  </div>
                )}
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  Direct reports {directReports.length > 0 && `· ${directReports.length}`}
                </div>
                {directReports.length === 0 ? (
                  <p className="text-[13px] text-fg-subtle">None</p>
                ) : (
                  <div className="space-y-2">
                    {directReports.map((r) => (
                      <PersonLink key={r.id} p={r} tag={r.also ? "Also reports here" : undefined} />
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

          {recognitions.length > 0 && (
            <Card>
              <CardHeader
                icon={<Award />}
                title={`Recognition · ${recognitionCount}`}
                description={isSelf ? "What colleagues have said about your work." : `What colleagues have said about ${person.firstName}'s work.`}
                action={
                  <Link href="/announcements?tab=recognition" className="text-[12.5px] font-medium text-brand hover:underline">
                    The wall →
                  </Link>
                }
              />
              <CardBody className="space-y-3">
                {recognitions.map((r) => (
                  <RecognitionCard key={r.id} r={r} compact />
                ))}
              </CardBody>
            </Card>
          )}

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
        <div className="break-words">{value}</div>
      </div>
    </div>
  );
}

function PersonLink({
  p,
  tag,
}: {
  p: { id: string; firstName: string; lastName: string; title: string | null; avatarHue: number };
  /** A small label after the name, e.g. "Main" or "Also". */
  tag?: string;
}) {
  return (
    <Link href={`/people/${p.id}`} className="group flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-surface-hover">
      <Avatar person={p} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium group-hover:text-brand">
          {p.firstName} {p.lastName}
        </div>
        <div className="truncate text-xs text-fg-subtle">{p.title}</div>
      </div>
      {tag && <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[10.5px] font-semibold text-fg-muted">{tag}</span>}
    </Link>
  );
}
