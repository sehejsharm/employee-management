import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Crown, FileCheck2, ListChecks, MessageCircleQuestion, MessagesSquare, Paperclip } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { RichText } from "@/components/ui/rich-text";
import { FadeIn } from "@/components/motion";
import { ActivityFeed } from "@/components/tasks/activity-feed";
import { PriorityBadge } from "@/components/tasks/badges";
import {
  ActivityComposer,
  AttachmentsPanel,
  ChecklistPanel,
  DeadlineCard,
  HeaderStatus,
  TaskActions,
} from "@/components/tasks/task-detail-client";
import { NoClearance } from "@/components/clearance/no-clearance";
import { SubmissionsPanel, SubmitWorkPanel } from "@/components/tasks/submissions";
import { ReassignDialog } from "@/components/tasks/reassign-dialog";
import { pickablePeople } from "@/lib/people";
import { requireUser } from "@/lib/auth/current-user";
import { clearanceBlock, getClearedIds, pendingClearanceWaitingOn } from "@/lib/clearance";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import {
  canAssignTasks,
  canChangeStatus,
  canContribute,
  canEditTask,
  canRequestUpdate,
  canReviewWork,
  canSubmitWork,
  canViewTask,
  isFounder,
} from "@/lib/permissions";
import { assigneeOrder } from "@/lib/tasks/queries";
import { formatDateTime, timeAgo } from "@/lib/time";
import { getTimeZone } from "@/lib/tz.server";
import { taskRef } from "@/lib/utils";

const person = { id: true, firstName: true, lastName: true, avatarHue: true, title: true } as const;
const attachmentSelect = {
  id: true,
  kind: true,
  title: true,
  url: true,
  content: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  createdById: true,
  createdBy: { select: { id: true, firstName: true, lastName: true, avatarHue: true } },
} as const;

async function load(id: string) {
  return db.task.findFirst({
    where: { id, archivedAt: null },
    include: {
      createdBy: { select: person },
      assignees: { select: { role: true, user: { select: { ...person, role: true } } }, orderBy: assigneeOrder },
      checklist: { orderBy: { position: "asc" }, select: { id: true, text: true, done: true } },
      // Task material only; proof lives with its submission.
      attachments: { where: { submissionId: null }, orderBy: { createdAt: "asc" }, select: attachmentSelect },
      submissions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          summary: true,
          createdAt: true,
          reviewedAt: true,
          reviewNote: true,
          submittedBy: { select: { id: true, firstName: true, lastName: true, avatarHue: true } },
          reviewedBy: { select: { firstName: true, lastName: true } },
          attachments: { orderBy: { createdAt: "asc" }, select: attachmentSelect },
        },
      },
      activities: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          kind: true,
          body: true,
          meta: true,
          createdAt: true,
          actor: { select: { id: true, firstName: true, lastName: true, avatarHue: true } },
        },
      },
      updateRequests: {
        where: { resolvedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, message: true, createdAt: true, requestedBy: { select: person } },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const task = await db.task.findUnique({ where: { id }, select: { number: true } });
  return { title: task ? taskRef(task.number) : "Task" };
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const tz = await getTimeZone();
  const { id } = await params;
  const task = await load(id);
  if (!task) notFound();

  const cleared = await getClearedIds(user);
  const access = {
    createdById: task.createdById,
    assigneeIds: task.assignees.map((a) => a.user.id),
    involvesFounder: task.assignees.some((a) => a.user.role === "FOUNDER"),
  };
  const lead = task.assignees.find((a) => a.role === "LEAD")?.user ?? task.assignees[0]?.user ?? null;
  const followers = task.assignees.map((a) => a.user).filter((a) => a.id !== lead?.id);

  // Someone else's work without clearance: say so plainly (founders' work can't be requested).
  if (!canViewTask(user, access, cleared)) {
    const founderWork = access.involvesFounder;
    const subject = lead ?? task.createdBy;
    const block = founderWork ? clearanceBlock({ role: "FOUNDER", firstName: subject.firstName }) : clearanceBlock({ role: "EMPLOYEE", firstName: subject.firstName });
    const waitingOn = block.requestable ? await pendingClearanceWaitingOn(user.id, subject) : null;
    return (
      <FadeIn>
        <Link href="/tasks" className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted transition hover:text-fg">
          <ChevronLeft className="size-4" /> Tasks
        </Link>
        <Card className="mx-auto max-w-xl">
          <NoClearance subject={subject} reason={block.reason} requestable={block.requestable} pending={waitingOn} canRequest={!isFounder(user)} className="py-12" />
        </Card>
      </FadeIn>
    );
  }

  const isAssignee = access.assigneeIds.includes(user.id);
  const editable = canEditTask(user, access);
  const contribute = canContribute(user, access);
  const reviewer = canReviewWork(user, access);
  const ref = taskRef(task.number);
  // Founders (and whoever assigned it) can hand the task on or add people, unless it's finished.
  const canReassign = editable && task.status !== "DONE";
  const reassignProps = canReassign
    ? {
        taskId: task.id,
        taskRef: ref,
        people: await pickablePeople(),
        assigneeIds: access.assigneeIds,
        leadId: lead?.id ?? null,
        selfId: user.id,
        restrictedToSelf: !canAssignTasks(user),
      }
    : null;
  const openRequests = task.updateRequests;
  // Keyed on the pending submission, so a task left "In review" with nothing handed in can still be submitted.
  const canSubmit = canSubmitWork(user, access) && task.status !== "DONE" && !task.submissions.some((s) => s.status === "SUBMITTED");
  const lastSentBack = task.submissions[0]?.status === "CHANGES_REQUESTED" ? task.submissions[0].reviewNote : null;
  const toClientAttachment = (a: (typeof task.attachments)[number], removable: boolean) => ({
    id: a.id,
    kind: a.kind,
    title: a.title,
    url: a.url,
    content: a.content,
    fileName: a.fileName,
    mimeType: a.mimeType,
    size: a.size,
    createdAt: a.createdAt.toISOString(),
    createdBy: a.createdBy,
    canRemove: removable,
  });

  return (
    <FadeIn>
      <Link href="/tasks" className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted transition hover:text-fg">
        <ChevronLeft className="size-4" /> Tasks
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-surface-sunken px-2 py-0.5 font-mono text-xs font-medium text-fg-muted ring-1 ring-line">{ref}</span>
            <HeaderStatus taskId={task.id} status={task.status} canChange={canChangeStatus(user, access) && contribute} />
            <PriorityBadge priority={task.priority} />
          </div>
          <h1 className="text-balance text-[26px] font-semibold leading-tight tracking-[-0.025em] sm:text-[32px]">{task.title}</h1>
          <p className="mt-2 text-[13.5px] text-fg-muted">
            Assigned by <span className="font-medium text-fg">{task.createdBy.firstName} {task.createdBy.lastName}</span>{" "}
            <span suppressHydrationWarning title={formatDateTime(task.createdAt, tz)}>
              {timeAgo(task.createdAt)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {reassignProps && <ReassignDialog {...reassignProps} className="lg:hidden" />}
          <TaskActions
            taskId={task.id}
            taskRef={ref}
            canEdit={editable}
            canRequest={task.status !== "IN_REVIEW" && task.status !== "DONE" && canRequestUpdate(user, access)}
            assigneeNames={task.assignees.map((a) => a.user.firstName).join(", ")}
          />
        </div>
      </div>

      {openRequests.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-info/25 bg-info-soft/60">
          {openRequests.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 border-b border-info/15 p-4 last:border-0 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info">
                  <MessageCircleQuestion className="size-[18px]" />
                </span>
                <div>
                  <p className="text-[13.5px]">
                    <span className="font-semibold">
                      {r.requestedBy.firstName} {r.requestedBy.lastName}
                    </span>{" "}
                    asked for an update <span className="text-fg-subtle" suppressHydrationWarning>· {timeAgo(r.createdAt)}</span>
                  </p>
                  {r.message && <p className="mt-0.5 text-[13.5px] text-fg-muted">“{r.message}”</p>}
                </div>
              </div>
              {isAssignee && (
                <a
                  href="#post-update"
                  className="inline-flex h-9 items-center justify-center rounded-[10px] bg-brand px-3.5 text-[13px] font-medium text-brand-fg shadow-sm transition hover:bg-brand-hover"
                >
                  Post an update
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Brief" />
            <CardBody>
              {task.description ? (
                <RichText text={task.description} />
              ) : (
                <p className="text-[13.5px] text-fg-subtle">No description was added.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              icon={<Paperclip />}
              title="Links, notes & documents"
              description={task.attachments.length ? `${task.attachments.length} attached` : undefined}
            />
            <CardBody>
              <AttachmentsPanel
                taskId={task.id}
                canContribute={contribute}
                maxUploadBytes={config.maxUploadBytes()}
                attachments={task.attachments.map((a) => toClientAttachment(a, a.createdById === user.id || editable))}
              />
            </CardBody>
          </Card>

          {canSubmit && (
            <SubmitWorkPanel
              taskId={task.id}
              maxUploadBytes={config.maxUploadBytes()}
              reviewer={task.createdById === user.id ? "You" : task.createdBy.firstName}
              sentBack={lastSentBack}
            />
          )}

          {task.submissions.length > 0 && (
            <Card id="submissions" className="scroll-mt-24">
              <CardHeader
                icon={<FileCheck2 />}
                title="Submitted work"
                description={
                  task.status === "IN_REVIEW"
                    ? reviewer
                      ? "Waiting for your review."
                      : `Waiting for ${task.createdBy.firstName} to review.`
                    : `${task.submissions.length} submission${task.submissions.length === 1 ? "" : "s"}`
                }
              />
              <CardBody>
                <SubmissionsPanel
                  canReview={reviewer}
                  submissions={task.submissions.map((sub) => ({
                    id: sub.id,
                    status: sub.status,
                    summary: sub.summary,
                    createdAt: sub.createdAt.toISOString(),
                    reviewedAt: sub.reviewedAt?.toISOString() ?? null,
                    reviewNote: sub.reviewNote,
                    submittedBy: sub.submittedBy,
                    reviewedBy: sub.reviewedBy,
                    attachments: sub.attachments.map((a) => toClientAttachment(a, false)),
                  }))}
                />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader icon={<ListChecks />} title="Checklist" />
            <CardBody className="pt-3">
              <ChecklistPanel taskId={task.id} items={task.checklist} canContribute={contribute} />
            </CardBody>
          </Card>

          <section id="activity" className="scroll-mt-24">
            <div className="mb-4 flex items-center gap-2">
              <MessagesSquare className="size-4 text-brand" />
              <h2 className="text-[15px] font-semibold">Updates & activity</h2>
            </div>
            <ActivityFeed
              tz={tz}
              entries={task.activities.map((a) => ({ ...a, meta: (a.meta as Record<string, unknown> | null) ?? null }))}
            />
            {contribute && (
              <div className="mt-5">
                <ActivityComposer
                  taskId={task.id}
                  me={{ firstName: user.firstName, lastName: user.lastName, avatarHue: user.avatarHue }}
                  canUpdate={isAssignee || editable}
                  currentProgress={task.progress}
                  currentStatus={task.status}
                  focusUpdate={isAssignee && openRequests.length > 0}
                />
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <DeadlineCard dueAt={task.dueAt.toISOString()} status={task.status} tz={tz} progress={task.progress} />
          <Card className="p-5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand">
              <Crown className="size-3" /> Lead
            </div>
            {lead && (
              <Link href={`/people/${lead.id}`} className="group mt-3 flex items-center gap-3">
                <Avatar person={lead} size="md" />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium group-hover:text-brand">
                    {lead.firstName} {lead.lastName}
                    {lead.id === user.id && <span className="ml-1 font-normal text-fg-subtle">(you)</span>}
                  </span>
                  <span className="block truncate text-xs text-fg-subtle">{lead.title}</span>
                </span>
              </Link>
            )}
            {followers.length > 0 && (
              <>
                <div className="mt-5 border-t border-line pt-4 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  Following · {followers.length}
                </div>
                <ul className="mt-3 space-y-2.5">
                  {followers.map((a) => (
                    <li key={a.id}>
                      <Link href={`/people/${a.id}`} className="group flex items-center gap-3">
                        <Avatar person={a} size="md" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium group-hover:text-brand">
                            {a.firstName} {a.lastName}
                            {a.id === user.id && <span className="ml-1 font-normal text-fg-subtle">(you)</span>}
                          </span>
                          <span className="block truncate text-xs text-fg-subtle">{a.title}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {reassignProps && <ReassignDialog {...reassignProps} variant="soft" className="mt-4 hidden w-full lg:inline-flex" />}
            <div className="mt-5 border-t border-line pt-4 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Assigned by · reviews the work</div>
            <Link href={`/people/${task.createdBy.id}`} className="group mt-3 flex items-center gap-3">
              <Avatar person={task.createdBy} size="md" />
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium group-hover:text-brand">
                  {task.createdBy.firstName} {task.createdBy.lastName}
                </span>
                <span className="block truncate text-xs text-fg-subtle">{task.createdBy.title}</span>
              </span>
            </Link>
            <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[13px]">
              <div className="flex justify-between gap-4">
                <dt className="text-fg-subtle">Created</dt>
                <dd className="text-right" suppressHydrationWarning>{formatDateTime(task.createdAt, tz)}</dd>
              </div>
              {task.completedAt && (
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-subtle">Completed</dt>
                  <dd className="text-right" suppressHydrationWarning>{formatDateTime(task.completedAt, tz)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-fg-subtle">Time zone</dt>
                <dd className="text-right">{tz.replace(/_/g, " ")}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </FadeIn>
  );
}
