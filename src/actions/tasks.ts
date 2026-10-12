"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth/current-user";
import { getClearedIds } from "@/lib/clearance";
import {
  canAssignTasks,
  canChangeStatus,
  canContribute,
  canEditTask,
  canRequestUpdate,
  canReviewWork,
  canSubmitWork,
  isInvolved,
  type Actor,
  type TaskAccessContext,
} from "@/lib/permissions";
import { notify } from "@/lib/notifications";
import { config } from "@/lib/env";
import { formatBytes, fullName, safeHttpUrl, taskRef, type ActionResult } from "@/lib/utils";
import type { TaskStatus } from "@/generated/prisma/enums";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const STATUS = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"] as const;
const PRIORITY = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  BLOCKED: "Blocked",
  DONE: "Done",
};

const SUBMIT_HINT = "Hand work in with Submit work — it needs proof: a document (Word, PDF…), a written account or a link.";

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  return issue?.message ?? "Some of the details aren't valid.";
}

async function loadTask(taskId: string) {
  return db.task.findFirst({
    where: { id: taskId, archivedAt: null },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      dueAt: true,
      createdById: true,
      assignees: { select: { userId: true, role: true, user: { select: { role: true, firstName: true } } } },
    },
  });
}

type LoadedTask = NonNullable<Awaited<ReturnType<typeof loadTask>>>;

function ctx(task: LoadedTask): TaskAccessContext {
  return {
    createdById: task.createdById,
    assigneeIds: task.assignees.map((a) => a.userId),
    involvesFounder: task.assignees.some((a) => a.user.role === "FOUNDER"),
  };
}

/** Everyone with a stake in a task: its creator and its assignees. */
function participants(task: LoadedTask) {
  return [task.createdById, ...task.assignees.map((a) => a.userId)];
}

async function withTask(
  taskId: string,
  check: (user: CurrentUser & Actor, task: LoadedTask, cleared: Set<string>) => boolean,
) {
  const user = await requireUser();
  const task = await loadTask(taskId);
  if (!task) return { error: "That task no longer exists." } as const;
  const cleared = await getClearedIds(user);
  if (!check(user, task, cleared)) return { error: "You don't have permission to do that on this task." } as const;
  return { user, task, cleared } as const;
}

/** One lead, everyone else follows. Falls back to the first person picked. */
function pickLead(ids: string[], leadId: string | undefined) {
  return leadId && ids.includes(leadId) ? leadId : ids[0];
}

/** Assignees must be real, current people. Former employees can't be given work. */
async function validateAssignees(user: Actor, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { error: "Assign the task to at least one person." } as const;
  if (unique.length > 25) return { error: "A task can have at most 25 assignees." } as const;
  if (!canAssignTasks(user) && unique.some((id) => id !== user.id)) {
    return { error: "You can create tasks for yourself. Ask a founder to give you assigning rights for others." } as const;
  }
  const found = await db.user.findMany({
    where: { id: { in: unique }, status: { not: "INACTIVE" } },
    select: { id: true },
  });
  if (found.length !== unique.length) return { error: "One of the selected people is no longer active." } as const;
  return { ids: unique } as const;
}

const linkSchema = z.object({
  title: z.string().trim().max(160).optional().default(""),
  url: z.string().trim().min(1, "Add a URL.").max(2000),
});

const noteSchema = z.object({
  title: z.string().trim().min(1, "Give the note a title.").max(160),
  content: z.string().trim().min(1, "The note is empty.").max(20000),
});

/* -------------------------------------------------------------------------- */
/* Create & edit                                                              */
/* -------------------------------------------------------------------------- */

const taskSchema = z.object({
  title: z.string().trim().min(3, "Give the task a title (at least 3 characters).").max(200, "Keep the title under 200 characters."),
  description: z.string().trim().max(20000).optional().default(""),
  priority: z.enum(PRIORITY),
  dueAt: z.iso.datetime({ offset: true, message: "Pick a due date and time." }),
  assigneeIds: z.array(z.string().min(1)).max(25),
  /** Who leads the task; must be one of the assignees (defaults to the first). */
  leadId: z.string().min(1).optional(),
  links: z.array(linkSchema).max(20).optional().default([]),
  notes: z.array(noteSchema).max(20).optional().default([]),
  checklist: z.array(z.string().trim().min(1).max(300)).max(50).optional().default([]),
});

export type TaskInput = z.input<typeof taskSchema>;

/** Tells new assignees what they've been given: the lead learns they're leading, followers who they're following. */
async function notifyAssigned(actor: CurrentUser, task: { id: string; number: number; title: string }, ids: string[], leadId: string) {
  const ref = taskRef(task.number);
  const href = `/tasks/${task.id}`;
  if (ids.includes(leadId)) {
    await notify([leadId], { kind: "TASK_ASSIGNED", actorId: actor.id, taskId: task.id, href, title: `${actor.firstName} asked you to lead ${ref}`, body: task.title });
  }
  const followers = ids.filter((id) => id !== leadId);
  if (followers.length) {
    const lead = await db.user.findUnique({ where: { id: leadId }, select: { firstName: true } });
    await notify(followers, {
      kind: "TASK_ASSIGNED",
      actorId: actor.id,
      taskId: task.id,
      href,
      title: `${actor.firstName} added you to ${ref}${lead ? ` — ${lead.firstName} leads` : ""}`,
      body: task.title,
    });
  }
}

export async function createTask(input: TaskInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const data = parsed.data;

  const due = new Date(data.dueAt);
  if (due.getTime() < Date.now() - 5 * 60 * 1000) return { ok: false, error: "The deadline is in the past." };

  const assignees = await validateAssignees(user, data.assigneeIds);
  if ("error" in assignees) return { ok: false, error: assignees.error! };
  const lead = pickLead(assignees.ids, data.leadId);

  const links = [];
  for (const l of data.links) {
    const url = safeHttpUrl(l.url);
    if (!url) return { ok: false, error: `"${l.url}" isn't a valid http(s) link.` };
    links.push({ title: l.title || new URL(url).hostname, url });
  }

  const task = await db.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      priority: data.priority,
      dueAt: due,
      createdById: user.id,
      assignees: { create: assignees.ids.map((userId) => ({ userId, role: userId === lead ? ("LEAD" as const) : ("FOLLOWER" as const) })) },
      checklist: { create: data.checklist.map((text, position) => ({ text, position })) },
      attachments: {
        create: [
          ...links.map((l) => ({ kind: "LINK" as const, title: l.title, url: l.url, createdById: user.id })),
          ...data.notes.map((n) => ({ kind: "NOTE" as const, title: n.title, content: n.content, createdById: user.id })),
        ],
      },
      activities: { create: { actorId: user.id, kind: "CREATED" } },
    },
    select: { id: true, number: true, title: true },
  });

  await notifyAssigned(user, task, assignees.ids, lead);
  return { ok: true, data: { id: task.id } };
}

const editSchema = taskSchema.pick({ title: true, description: true, priority: true, dueAt: true, assigneeIds: true, leadId: true });

export async function updateTask(taskId: string, input: z.input<typeof editSchema>): Promise<ActionResult> {
  const r = await withTask(taskId, (u, t) => canEditTask(u, ctx(t)));
  if ("error" in r) return { ok: false, error: r.error! };
  const { user, task } = r;

  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const data = parsed.data;

  const assignees = await validateAssignees(user, data.assigneeIds);
  if ("error" in assignees) return { ok: false, error: assignees.error! };

  const current = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { title: true, description: true, priority: true, dueAt: true },
  });
  const due = new Date(data.dueAt);
  const before = new Set(task.assignees.map((a) => a.userId));
  const added = assignees.ids.filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !assignees.ids.includes(id));
  const previousLead = task.assignees.find((a) => a.role === "LEAD")?.userId ?? null;
  const lead = pickLead(assignees.ids, data.leadId);

  const activities: {
    actorId: string;
    kind: "EDITED" | "DUE_CHANGED" | "PRIORITY_CHANGED" | "ASSIGNEES_CHANGED" | "LEAD_CHANGED";
    meta?: object;
  }[] = [];
  if (current.title !== data.title || (current.description ?? "") !== data.description) activities.push({ actorId: user.id, kind: "EDITED" });
  if (current.dueAt.getTime() !== due.getTime())
    activities.push({ actorId: user.id, kind: "DUE_CHANGED", meta: { from: current.dueAt.toISOString(), to: due.toISOString() } });
  if (current.priority !== data.priority)
    activities.push({ actorId: user.id, kind: "PRIORITY_CHANGED", meta: { from: current.priority, to: data.priority } });
  if (added.length || removed.length) {
    const names = await db.user.findMany({ where: { id: { in: [...added, ...removed] } }, select: { id: true, firstName: true, lastName: true } });
    const nameOf = (id: string) => fullName(names.find((n) => n.id === id)!);
    activities.push({ actorId: user.id, kind: "ASSIGNEES_CHANGED", meta: { added: added.map(nameOf), removed: removed.map(nameOf) } });
  }
  if (lead !== previousLead) {
    const people = await db.user.findMany({ where: { id: { in: [lead, previousLead].filter(Boolean) as string[] } }, select: { id: true, firstName: true, lastName: true } });
    const nameOf = (id: string | null) => (id ? fullName(people.find((n) => n.id === id) ?? { firstName: "", lastName: "" }) : null);
    activities.push({ actorId: user.id, kind: "LEAD_CHANGED", meta: { from: nameOf(previousLead), to: nameOf(lead) } });
  }

  await db.$transaction([
    db.task.update({
      where: { id: taskId },
      data: { title: data.title, description: data.description || null, priority: data.priority, dueAt: due },
    }),
    db.taskAssignee.deleteMany({ where: { taskId, userId: { in: removed } } }),
    db.taskAssignee.createMany({ data: added.map((userId) => ({ taskId, userId })), skipDuplicates: true }),
    db.taskAssignee.updateMany({ where: { taskId, userId: { not: lead } }, data: { role: "FOLLOWER" } }),
    db.taskAssignee.update({ where: { taskId_userId: { taskId, userId: lead } }, data: { role: "LEAD" } }),
    db.taskActivity.createMany({ data: activities.map((a) => ({ ...a, taskId, meta: a.meta as never })) }),
  ]);

  const href = `/tasks/${taskId}`;
  if (added.length) await notifyAssigned(user, { id: taskId, number: task.number, title: data.title }, added, lead);
  if (removed.length) {
    await notify(removed, {
      kind: "TASK_STATUS",
      actorId: user.id,
      taskId,
      href,
      title: `${user.firstName} took you off ${taskRef(task.number)}`,
      body: `${data.title} — it's no longer on your list.`,
    });
  }
  if (lead !== previousLead && !added.includes(lead)) {
    await notify([lead], { kind: "TASK_STATUS", actorId: user.id, taskId, href, title: `${user.firstName} made you the lead on ${taskRef(task.number)}`, body: data.title });
  }
  if (current.dueAt.getTime() !== due.getTime()) {
    const stayed = assignees.ids.filter((id) => before.has(id));
    await notify(stayed, {
      kind: "TASK_STATUS",
      actorId: user.id,
      taskId,
      href,
      title: `${user.firstName} moved the deadline on ${taskRef(task.number)}`,
      body: data.title,
    });
  }

  refresh();
  return { ok: true, message: "Task updated." };
}

const reassignSchema = z.object({
  assigneeIds: z.array(z.string().min(1)).max(25),
  leadId: z.string().min(1).optional(),
});

/**
 * Reassigns a task or adds people to it without touching anything else —
 * the quick path from the task page. Same rules and notifications as a full
 * edit: founders and whoever assigned it.
 */
export async function reassignTask(taskId: string, input: z.input<typeof reassignSchema>): Promise<ActionResult> {
  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const current = await db.task.findFirst({
    where: { id: taskId, archivedAt: null },
    select: { title: true, description: true, priority: true, dueAt: true },
  });
  if (!current) return { ok: false, error: "That task no longer exists." };
  const res = await updateTask(taskId, {
    title: current.title,
    description: current.description ?? "",
    priority: current.priority,
    dueAt: current.dueAt.toISOString(),
    assigneeIds: parsed.data.assigneeIds,
    leadId: parsed.data.leadId,
  });
  return res.ok ? { ok: true, message: "People on this task updated — everyone affected has been notified." } : res;
}

export async function archiveTask(taskId: string): Promise<ActionResult> {
  const r = await withTask(taskId, (u, t) => canEditTask(u, ctx(t)));
  if ("error" in r) return { ok: false, error: r.error! };
  await db.task.update({ where: { id: taskId }, data: { archivedAt: new Date() } });
  return { ok: true, message: "Task deleted." };
}

/* -------------------------------------------------------------------------- */
/* Status & progress                                                          */
/* -------------------------------------------------------------------------- */

export async function setTaskStatus(taskId: string, status: TaskStatus): Promise<ActionResult> {
  if (!STATUS.includes(status)) return { ok: false, error: "Unknown status." };
  const r = await withTask(taskId, (u, t) => canChangeStatus(u, ctx(t)));
  if ("error" in r) return { ok: false, error: r.error! };
  const { user, task } = r;
  if (task.status === status) return { ok: true };

  // Work only reaches review through a submission with proof, and only a reviewer closes it.
  if (status === "IN_REVIEW") return { ok: false, error: SUBMIT_HINT };
  const pending = await pendingSubmission(taskId);
  if (status === "DONE") {
    if (!canReviewWork(user, ctx(task))) return { ok: false, error: "Submit your work for review — whoever assigned it marks it done once they've checked it." };
    if (!pending) return { ok: false, error: "There's no submitted work to accept yet. The lead or a follower submits it with proof first." };
    return acceptSubmission(user, task, pending.id, null);
  }
  if (task.status === "IN_REVIEW" && pending) {
    if (!canReviewWork(user, ctx(task))) return { ok: false, error: "This is with the reviewer now — they'll accept it or send it back." };
    return sendBack(user, task, pending.id, `Moved back to ${STATUS_LABEL[status]}.`, status);
  }

  await db.$transaction([
    db.task.update({ where: { id: taskId }, data: { status, completedAt: null } }),
    db.taskActivity.create({
      data: { taskId, actorId: user.id, kind: "STATUS_CHANGED", meta: { from: task.status, to: status } },
    }),
  ]);

  await notify(participants(task), {
    kind: "TASK_STATUS",
    actorId: user.id,
    taskId,
    href: `/tasks/${taskId}`,
    title: `${user.firstName} moved ${taskRef(task.number)} to ${STATUS_LABEL[status]}`,
    body: task.title,
  });

  refresh();
  return { ok: true };
}

const updateSchema = z.object({
  body: z.string().trim().min(2, "Write a short update.").max(5000),
  progress: z.number().int().min(0).max(100),
  status: z.enum(STATUS).optional(),
});

/**
 * An assignee's progress report. Answers every open update request on the
 * task, and tells whoever asked.
 */
export async function postProgressUpdate(taskId: string, input: z.input<typeof updateSchema>): Promise<ActionResult> {
  const r = await withTask(taskId, (u, t) => ctx(t).assigneeIds.includes(u.id) || canEditTask(u, ctx(t)));
  if ("error" in r) return { ok: false, error: r.error! };
  const { user, task } = r;

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { body, progress, status } = parsed.data;
  if (status === "DONE" || status === "IN_REVIEW") return { ok: false, error: SUBMIT_HINT };
  // Submitted work only leaves review through the reviewer (accept, or send back with notes).
  if (status && status !== task.status && task.status === "IN_REVIEW" && (await pendingSubmission(taskId))) {
    return { ok: false, error: "This is with the reviewer now — they'll accept it or send it back." };
  }

  const open = await db.updateRequest.findMany({
    where: { taskId, resolvedAt: null },
    select: { id: true, requestedById: true, requestedBy: { select: { role: true } } },
  });
  // Whoever asked hears back only while they can still see the task (founders, or people on it).
  const access = ctx(task);
  const askers = open.filter((o) => o.requestedBy.role === "FOUNDER" || (!access.involvesFounder && isInvolved({ id: o.requestedById }, access)));
  // 100% is a progress report, not a hand-in: finishing still goes through Submit work.
  const nextStatus = status ?? (task.status === "TODO" && progress > 0 ? "IN_PROGRESS" : task.status);

  await db.$transaction([
    db.taskActivity.create({ data: { taskId, actorId: user.id, kind: "PROGRESS_UPDATE", body, meta: { progress } } }),
    db.task.update({
      where: { id: taskId },
      data: {
        progress,
        status: nextStatus,
        ...(nextStatus !== "DONE" && { completedAt: null }),
      },
    }),
    ...(nextStatus !== task.status
      ? [db.taskActivity.create({ data: { taskId, actorId: user.id, kind: "STATUS_CHANGED", meta: { from: task.status, to: nextStatus } } })]
      : []),
    db.updateRequest.updateMany({ where: { taskId, resolvedAt: null }, data: { resolvedAt: new Date() } }),
  ]);

  await notify([task.createdById, ...askers.map((o) => o.requestedById), ...task.assignees.map((a) => a.userId)], {
    kind: "UPDATE_POSTED",
    actorId: user.id,
    taskId,
    href: `/tasks/${taskId}`,
    title: `${user.firstName} posted an update on ${taskRef(task.number)} · ${progress}%`,
    body: body.length > 140 ? `${body.slice(0, 137)}…` : body,
  });

  refresh();
  return { ok: true, message: open.length ? "Update posted — the request has been answered." : "Update posted." };
}

const requestSchema = z.object({ message: z.string().trim().max(1000).optional().default("") });

export async function requestUpdate(taskId: string, input: z.input<typeof requestSchema>): Promise<ActionResult> {
  const r = await withTask(taskId, (u, t) => canRequestUpdate(u, ctx(t)));
  if ("error" in r) return { ok: false, error: r.error! };
  const { user, task } = r;
  if (task.status === "IN_REVIEW") return { ok: false, error: "The work has been submitted — it's waiting for review, not an update." };
  if (task.status === "DONE") return { ok: false, error: "This task is done." };
  const { message } = requestSchema.parse(input);

  const recent = await db.updateRequest.findFirst({
    where: { taskId, requestedById: user.id, resolvedAt: null, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent) return { ok: false, error: "You asked for an update less than an hour ago — it's still open." };

  await db.$transaction([
    db.updateRequest.create({ data: { taskId, requestedById: user.id, message: message || null } }),
    db.taskActivity.create({ data: { taskId, actorId: user.id, kind: "UPDATE_REQUESTED", body: message || null } }),
  ]);

  await notify(
    task.assignees.map((a) => a.userId),
    {
      kind: "UPDATE_REQUESTED",
      actorId: user.id,
      taskId,
      href: `/tasks/${taskId}#activity`,
      title: `${user.firstName} asked for an update on ${taskRef(task.number)}`,
      body: message || task.title,
    },
  );

  refresh();
  return { ok: true, message: "Update requested. The assignees have been notified." };
}

/* -------------------------------------------------------------------------- */
/* Conversation                                                               */
/* -------------------------------------------------------------------------- */

export async function postComment(taskId: string, body: string): Promise<ActionResult> {
  const r = await withTask(taskId, (u, t) => canContribute(u, ctx(t)));
  if ("error" in r) return { ok: false, error: r.error! };
  const { user, task } = r;
  const text = body.trim();
  if (!text) return { ok: false, error: "Write something first." };
  if (text.length > 5000) return { ok: false, error: "Keep comments under 5,000 characters." };

  await db.taskActivity.create({ data: { taskId, actorId: user.id, kind: "COMMENT", body: text } });
  await notify(participants(task), {
    kind: "TASK_COMMENT",
    actorId: user.id,
    taskId,
    href: `/tasks/${taskId}#activity`,
    title: `${user.firstName} commented on ${taskRef(task.number)}`,
    body: text.length > 140 ? `${text.slice(0, 137)}…` : text,
  });

  refresh();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Attachments                                                                */
/* -------------------------------------------------------------------------- */

export async function addLink(taskId: string, input: z.input<typeof linkSchema>): Promise<ActionResult> {
  const r = await withTask(taskId, (u, t) => canContribute(u, ctx(t)));
  if ("error" in r) return { ok: false, error: r.error! };
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const url = safeHttpUrl(parsed.data.url);
  if (!url) return { ok: false, error: "That isn't a valid http(s) link." };
  const title = parsed.data.title || new URL(url).hostname;

  await db.$transaction([
    db.attachment.create({ data: { taskId, kind: "LINK", title, url, createdById: r.user.id } }),
    db.taskActivity.create({ data: { taskId, actorId: r.user.id, kind: "ATTACHMENT_ADDED", meta: { kind: "LINK", title } } }),
  ]);
  refresh();
  return { ok: true, message: "Link added." };
}

export async function addNote(taskId: string, input: z.input<typeof noteSchema>): Promise<ActionResult> {
  const r = await withTask(taskId, (u, t) => canContribute(u, ctx(t)));
  if ("error" in r) return { ok: false, error: r.error! };
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  await db.$transaction([
    db.attachment.create({ data: { taskId, kind: "NOTE", title: parsed.data.title, content: parsed.data.content, createdById: r.user.id } }),
    db.taskActivity.create({
      data: { taskId, actorId: r.user.id, kind: "ATTACHMENT_ADDED", meta: { kind: "NOTE", title: parsed.data.title } },
    }),
  ]);
  refresh();
  return { ok: true, message: "Note added." };
}

/** Executable and markup types are refused outright; everything else downloads as an attachment. */
const BLOCKED_EXTENSIONS = /\.(exe|bat|cmd|com|msi|sh|ps1|scr|js|vbs|jar|html?|svg|xhtml)$/i;

export async function uploadFile(taskId: string, formData: FormData): Promise<ActionResult> {
  const r = await withTask(taskId, (u, t) => canContribute(u, ctx(t)));
  if ("error" in r) return { ok: false, error: r.error! };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  const max = config.maxUploadBytes();
  if (file.size > max) return { ok: false, error: `Files can be up to ${formatBytes(max)}. For bigger files, attach a Drive link instead.` };
  const name = file.name.replace(/[\\/\0]/g, "_").slice(0, 200) || "file";
  if (BLOCKED_EXTENSIONS.test(name)) return { ok: false, error: "That file type isn't allowed. Zip it or share a link instead." };
  const title = String(formData.get("title") ?? "").trim().slice(0, 160) || name;

  const bytes = new Uint8Array(await file.arrayBuffer());
  await db.$transaction(async (tx) => {
    const blob = await tx.fileBlob.create({ data: { data: bytes }, select: { id: true } });
    await tx.attachment.create({
      data: {
        taskId,
        kind: "FILE",
        title,
        fileName: name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        blobId: blob.id,
        createdById: r.user.id,
      },
    });
    await tx.taskActivity.create({
      data: { taskId, actorId: r.user.id, kind: "ATTACHMENT_ADDED", meta: { kind: "FILE", title } },
    });
    // A few MB over a cross-region link can outlast Prisma's 5-second default.
  }, { timeout: 20_000, maxWait: 5_000 });

  refresh();
  return { ok: true, message: "File uploaded." };
}

export async function removeAttachment(attachmentId: string): Promise<ActionResult> {
  const user = await requireUser();
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, taskId: true, title: true, kind: true, createdById: true, blobId: true, submissionId: true },
  });
  if (!attachment) return { ok: false, error: "That attachment is already gone." };
  if (attachment.submissionId) return { ok: false, error: "Proof that's been submitted stays with the submission." };
  const task = await loadTask(attachment.taskId);
  if (!task) return { ok: false, error: "That task no longer exists." };
  if (attachment.createdById !== user.id && !canEditTask(user, ctx(task))) {
    return { ok: false, error: "Only whoever added it, or the task's owner, can remove this." };
  }

  await db.$transaction([
    db.attachment.delete({ where: { id: attachmentId } }),
    ...(attachment.blobId ? [db.fileBlob.delete({ where: { id: attachment.blobId } })] : []),
    db.taskActivity.create({
      data: { taskId: task.id, actorId: user.id, kind: "ATTACHMENT_REMOVED", meta: { kind: attachment.kind, title: attachment.title } },
    }),
  ]);
  refresh();
  return { ok: true, message: "Removed." };
}

/* -------------------------------------------------------------------------- */
/* Checklist                                                                  */
/* -------------------------------------------------------------------------- */

export async function addChecklistItem(taskId: string, text: string): Promise<ActionResult> {
  const r = await withTask(taskId, (u, t) => canContribute(u, ctx(t)));
  if ("error" in r) return { ok: false, error: r.error! };
  const clean = text.trim().slice(0, 300);
  if (!clean) return { ok: false, error: "Write the item first." };
  const last = await db.checklistItem.findFirst({ where: { taskId }, orderBy: { position: "desc" }, select: { position: true } });
  await db.checklistItem.create({ data: { taskId, text: clean, position: (last?.position ?? -1) + 1 } });
  refresh();
  return { ok: true };
}

async function checklistAccess(itemId: string) {
  const item = await db.checklistItem.findUnique({ where: { id: itemId }, select: { taskId: true } });
  if (!item) return { error: "That item is gone." } as const;
  return withTask(item.taskId, (u, t) => canContribute(u, ctx(t)));
}

export async function toggleChecklistItem(itemId: string, done: boolean): Promise<ActionResult> {
  const r = await checklistAccess(itemId);
  if ("error" in r) return { ok: false, error: r.error! };
  await db.checklistItem.update({ where: { id: itemId }, data: { done } });
  refresh();
  return { ok: true };
}

export async function removeChecklistItem(itemId: string): Promise<ActionResult> {
  const r = await checklistAccess(itemId);
  if ("error" in r) return { ok: false, error: r.error! };
  await db.checklistItem.delete({ where: { id: itemId } });
  refresh();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Submitting work & review                                                   */
/* -------------------------------------------------------------------------- */

/** Documents, spreadsheets, slides and screenshots count as proof. Never executables or markup. */
const PROOF_EXTENSIONS = /\.(pdf|docx?|odt|rtf|txt|md|pages|xlsx?|ods|csv|numbers|pptx?|odp|key|png|jpe?g|webp|heic|zip)$/i;
const MIN_WRITEUP = 40;

/** Someone else got there first; the transaction is rolled back and the message shown as is. */
class Conflict extends Error {}

/** Who is asked to review: whoever assigned the task, or every founder once that person has left. */
async function reviewersOf(task: LoadedTask) {
  const creator = await db.user.findUnique({ where: { id: task.createdById }, select: { status: true } });
  if (creator && creator.status !== "INACTIVE") return [task.createdById];
  const founders = await db.user.findMany({ where: { role: "FOUNDER", status: { not: "INACTIVE" } }, select: { id: true } });
  return founders.map((f) => f.id);
}

async function pendingSubmission(taskId: string) {
  return db.submission.findFirst({ where: { taskId, status: "SUBMITTED" }, orderBy: { createdAt: "desc" }, select: { id: true, submittedById: true } });
}

/**
 * The lead or a follower hands the work in. It must carry proof — a written
 * account of at least 40 characters, a document, or a link — and moves the
 * task to review. Reminders stop; whoever assigned it is asked to review.
 */
export async function submitWork(taskId: string, formData: FormData): Promise<ActionResult> {
  const r = await withTask(taskId, (u, t) => canSubmitWork(u, ctx(t)));
  if ("error" in r) return { ok: false, error: r.error === "You don't have permission to do that on this task." ? "Only the lead and followers on this task can submit its work." : r.error! };
  const { user, task } = r;
  if (task.status === "DONE") return { ok: false, error: "This task is already done." };
  if (await pendingSubmission(taskId)) return { ok: false, error: "Work is already with the reviewer. They'll accept it or send it back." };

  const summary = String(formData.get("summary") ?? "").trim().slice(0, 20000);

  const links: { url: string; title: string }[] = [];
  for (const raw of formData.getAll("link").map(String).map((l) => l.trim()).filter(Boolean).slice(0, 10)) {
    const url = safeHttpUrl(raw);
    if (!url) return { ok: false, error: `"${raw}" isn't a valid http(s) link.` };
    links.push({ url, title: new URL(url).hostname });
  }

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 5);
  const max = config.maxUploadBytes();
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > max) return { ok: false, error: `Files can be up to ${formatBytes(max)} in total. For bigger files, add a link instead.` };
  for (const f of files) {
    if (!PROOF_EXTENSIONS.test(f.name)) return { ok: false, error: `${f.name}: attach a document — PDF, Word, a spreadsheet, slides or a screenshot.` };
  }

  if (summary.length < MIN_WRITEUP && links.length === 0 && files.length === 0) {
    return {
      ok: false,
      error: `Add proof of the work: a written account (at least ${MIN_WRITEUP} characters), a document (Word, PDF…) or a link.`,
    };
  }

  const blobs = await Promise.all(files.map(async (f) => ({ file: f, bytes: new Uint8Array(await f.arrayBuffer()) })));
  try {
    await db.$transaction(
      async (tx) => {
        // One hand-in at a time: lock the task, then check again that nothing is already with the reviewer.
        await tx.$queryRaw`SELECT 1 FROM "Task" WHERE "id" = ${taskId} FOR UPDATE`;
        const current = await tx.task.findUnique({ where: { id: taskId }, select: { status: true } });
        if (current?.status === "DONE") throw new Conflict("This task is already done.");
        if (await tx.submission.findFirst({ where: { taskId, status: "SUBMITTED" }, select: { id: true } })) {
          throw new Conflict("Work is already with the reviewer. They'll accept it or send it back.");
        }
        const sub = await tx.submission.create({ data: { taskId, submittedById: user.id, summary: summary || null }, select: { id: true } });
        for (const l of links) {
          await tx.attachment.create({ data: { taskId, submissionId: sub.id, kind: "LINK", title: l.title, url: l.url, createdById: user.id } });
        }
        for (const { file, bytes } of blobs) {
          const blob = await tx.fileBlob.create({ data: { data: bytes }, select: { id: true } });
          const name = file.name.replace(/[\\/\0]/g, "_").slice(0, 200) || "document";
          await tx.attachment.create({
            data: {
              taskId,
              submissionId: sub.id,
              kind: "FILE",
              title: name,
              fileName: name,
              mimeType: file.type || "application/octet-stream",
              size: file.size,
              blobId: blob.id,
              createdById: user.id,
            },
          });
        }
        await tx.task.update({ where: { id: taskId }, data: { status: "IN_REVIEW" } });
        await tx.taskActivity.create({
          data: {
            taskId,
            actorId: user.id,
            kind: "WORK_SUBMITTED",
            body: summary ? (summary.length > 280 ? `${summary.slice(0, 277)}…` : summary) : null,
            meta: { submissionId: sub.id, files: files.length, links: links.length },
          },
        });
        // Handing the work in answers any open request for an update.
        await tx.updateRequest.updateMany({ where: { taskId, resolvedAt: null }, data: { resolvedAt: new Date() } });
        return sub;
      },
      { timeout: 20_000, maxWait: 5_000 },
    );
  } catch (e) {
    if (e instanceof Conflict) return { ok: false, error: e.message };
    throw e;
  }

  const ref = taskRef(task.number);
  const reviewers = await reviewersOf(task);
  await notify(reviewers, {
    kind: "WORK_SUBMITTED",
    actorId: user.id,
    taskId,
    href: `/tasks/${taskId}#submissions`,
    title: `${user.firstName} submitted ${ref} for your review`,
    body: task.title,
  });
  await notify(
    task.assignees.map((a) => a.userId).filter((id) => !reviewers.includes(id)),
    { kind: "WORK_SUBMITTED", actorId: user.id, taskId, href: `/tasks/${taskId}#submissions`, title: `${user.firstName} submitted the work on ${ref}`, body: task.title },
  );

  refresh();
  return { ok: true, message: "Submitted for review. Reminders have stopped." };
}

const reviewSchema = z.object({
  decision: z.enum(["accept", "changes"]),
  note: z.string().trim().max(5000).optional().default(""),
});

/** Whoever assigned the work (or a founder) accepts it — the task is done — or sends it back with what to change. */
export async function reviewSubmission(submissionId: string, input: z.input<typeof reviewSchema>): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const sub = await db.submission.findUnique({ where: { id: submissionId }, select: { id: true, taskId: true, status: true } });
  if (!sub) return { ok: false, error: "That submission no longer exists." };
  const r = await withTask(sub.taskId, (u, t) => canReviewWork(u, ctx(t)));
  if ("error" in r) return { ok: false, error: r.error === "You don't have permission to do that on this task." ? "Only whoever assigned this task, or a founder, can review its work." : r.error! };
  if (sub.status !== "SUBMITTED") return { ok: false, error: ALREADY_REVIEWED };

  const { decision, note } = parsed.data;
  if (decision === "accept") return acceptSubmission(r.user, r.task, sub.id, note || null);
  if (note.length < 3) return { ok: false, error: "Say what needs to change, so they know what to fix." };
  return sendBack(r.user, r.task, sub.id, note, "IN_PROGRESS");
}

const ALREADY_REVIEWED = "This submission has already been reviewed.";

async function acceptSubmission(user: CurrentUser, task: LoadedTask, submissionId: string, note: string | null): Promise<ActionResult> {
  const now = new Date();
  const claimed = await db.$transaction(async (tx) => {
    // Only one review wins: the submission is claimed while it's still waiting.
    const { count } = await tx.submission.updateMany({
      where: { id: submissionId, status: "SUBMITTED" },
      data: { status: "ACCEPTED", reviewedById: user.id, reviewedAt: now, reviewNote: note },
    });
    if (!count) return false;
    await tx.task.update({ where: { id: task.id }, data: { status: "DONE", completedAt: now, progress: 100 } });
    await tx.taskActivity.create({ data: { taskId: task.id, actorId: user.id, kind: "WORK_ACCEPTED", body: note, meta: { submissionId } } });
    await tx.taskActivity.create({ data: { taskId: task.id, actorId: user.id, kind: "STATUS_CHANGED", meta: { from: task.status, to: "DONE" } } });
    return true;
  });
  if (!claimed) return { ok: false, error: ALREADY_REVIEWED };
  await notify(participants(task), {
    kind: "WORK_REVIEWED",
    actorId: user.id,
    taskId: task.id,
    href: `/tasks/${task.id}#submissions`,
    title: `${user.firstName} accepted the work on ${taskRef(task.number)} — it's done`,
    body: note ?? task.title,
  });
  refresh();
  return { ok: true, message: "Accepted. The task is done." };
}

async function sendBack(user: CurrentUser, task: LoadedTask, submissionId: string, note: string, status: TaskStatus): Promise<ActionResult> {
  const now = new Date();
  const claimed = await db.$transaction(async (tx) => {
    const { count } = await tx.submission.updateMany({
      where: { id: submissionId, status: "SUBMITTED" },
      data: { status: "CHANGES_REQUESTED", reviewedById: user.id, reviewedAt: now, reviewNote: note },
    });
    if (!count) return false;
    await tx.task.update({ where: { id: task.id }, data: { status, completedAt: null } });
    await tx.taskActivity.create({ data: { taskId: task.id, actorId: user.id, kind: "CHANGES_REQUESTED", body: note, meta: { submissionId } } });
    await tx.taskActivity.create({ data: { taskId: task.id, actorId: user.id, kind: "STATUS_CHANGED", meta: { from: task.status, to: status } } });
    return true;
  });
  if (!claimed) return { ok: false, error: ALREADY_REVIEWED };
  await notify(participants(task), {
    kind: "WORK_REVIEWED",
    actorId: user.id,
    taskId: task.id,
    href: `/tasks/${task.id}#submissions`,
    title: `${user.firstName} sent ${taskRef(task.number)} back with changes`,
    body: note.length > 140 ? `${note.slice(0, 137)}…` : note,
  });
  refresh();
  return { ok: true, message: "Sent back with your notes. Reminders are back on." };
}
