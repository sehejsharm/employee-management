"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSubordinateIds, requireUser, type CurrentUser } from "@/lib/auth/current-user";
import {
  canAssignTasks,
  canChangeStatus,
  canContribute,
  canEditTask,
  canRequestUpdate,
  type Actor,
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
      assignees: { select: { userId: true } },
    },
  });
}

type LoadedTask = NonNullable<Awaited<ReturnType<typeof loadTask>>>;

function ctx(task: LoadedTask) {
  return { createdById: task.createdById, assigneeIds: task.assignees.map((a) => a.userId) };
}

/** Everyone with a stake in a task: its creator and its assignees. */
function participants(task: LoadedTask) {
  return [task.createdById, ...task.assignees.map((a) => a.userId)];
}

async function withTask(
  taskId: string,
  check: (user: CurrentUser & Actor, task: LoadedTask, subs: Set<string>) => boolean,
) {
  const user = await requireUser();
  const task = await loadTask(taskId);
  if (!task) return { error: "That task no longer exists." } as const;
  const subs = await getSubordinateIds(user.id);
  if (!check(user, task, subs)) return { error: "You don't have permission to do that on this task." } as const;
  return { user, task, subs } as const;
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
  links: z.array(linkSchema).max(20).optional().default([]),
  notes: z.array(noteSchema).max(20).optional().default([]),
  checklist: z.array(z.string().trim().min(1).max(300)).max(50).optional().default([]),
});

export type TaskInput = z.input<typeof taskSchema>;

export async function createTask(input: TaskInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const data = parsed.data;

  const due = new Date(data.dueAt);
  if (due.getTime() < Date.now() - 5 * 60 * 1000) return { ok: false, error: "The deadline is in the past." };

  const assignees = await validateAssignees(user, data.assigneeIds);
  if ("error" in assignees) return { ok: false, error: assignees.error! };

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
      assignees: { create: assignees.ids.map((userId) => ({ userId })) },
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

  await notify(assignees.ids, {
    kind: "TASK_ASSIGNED",
    actorId: user.id,
    taskId: task.id,
    href: `/tasks/${task.id}`,
    title: `${user.firstName} assigned you ${taskRef(task.number)}`,
    body: task.title,
  });

  return { ok: true, data: { id: task.id } };
}

const editSchema = taskSchema.pick({ title: true, description: true, priority: true, dueAt: true, assigneeIds: true });

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

  const activities: { actorId: string; kind: "EDITED" | "DUE_CHANGED" | "PRIORITY_CHANGED" | "ASSIGNEES_CHANGED"; meta?: object }[] = [];
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

  await db.$transaction([
    db.task.update({
      where: { id: taskId },
      data: { title: data.title, description: data.description || null, priority: data.priority, dueAt: due },
    }),
    db.taskAssignee.deleteMany({ where: { taskId, userId: { in: removed } } }),
    db.taskAssignee.createMany({ data: added.map((userId) => ({ taskId, userId })), skipDuplicates: true }),
    db.taskActivity.createMany({ data: activities.map((a) => ({ ...a, taskId, meta: a.meta as never })) }),
  ]);

  const href = `/tasks/${taskId}`;
  if (added.length) {
    await notify(added, {
      kind: "TASK_ASSIGNED",
      actorId: user.id,
      taskId,
      href,
      title: `${user.firstName} assigned you ${taskRef(task.number)}`,
      body: data.title,
    });
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

  await db.$transaction([
    db.task.update({
      where: { id: taskId },
      data: {
        status,
        completedAt: status === "DONE" ? new Date() : null,
        ...(status === "DONE" ? { progress: 100 } : {}),
      },
    }),
    db.taskActivity.create({
      data: { taskId, actorId: user.id, kind: "STATUS_CHANGED", meta: { from: task.status, to: status } },
    }),
  ]);

  await notify(participants(task), {
    kind: status === "DONE" ? "TASK_COMPLETED" : "TASK_STATUS",
    actorId: user.id,
    taskId,
    href: `/tasks/${taskId}`,
    title:
      status === "DONE"
        ? `${user.firstName} completed ${taskRef(task.number)}`
        : `${user.firstName} moved ${taskRef(task.number)} to ${STATUS_LABEL[status]}`,
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

  const open = await db.updateRequest.findMany({
    where: { taskId, resolvedAt: null },
    select: { id: true, requestedById: true },
  });
  const nextStatus = status ?? (progress === 100 ? "DONE" : task.status === "TODO" && progress > 0 ? "IN_PROGRESS" : task.status);

  await db.$transaction([
    db.taskActivity.create({ data: { taskId, actorId: user.id, kind: "PROGRESS_UPDATE", body, meta: { progress } } }),
    db.task.update({
      where: { id: taskId },
      data: {
        progress,
        status: nextStatus,
        completedAt: nextStatus === "DONE" ? new Date() : null,
      },
    }),
    ...(nextStatus !== task.status
      ? [db.taskActivity.create({ data: { taskId, actorId: user.id, kind: "STATUS_CHANGED", meta: { from: task.status, to: nextStatus } } })]
      : []),
    db.updateRequest.updateMany({ where: { taskId, resolvedAt: null }, data: { resolvedAt: new Date() } }),
  ]);

  await notify([task.createdById, ...open.map((o) => o.requestedById), ...task.assignees.map((a) => a.userId)], {
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
  const r = await withTask(taskId, (u, t, subs) => canRequestUpdate(u, ctx(t), subs));
  if ("error" in r) return { ok: false, error: r.error! };
  const { user, task } = r;
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
  const r = await withTask(taskId, (u, t, subs) => canContribute(u, ctx(t), subs));
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
  const r = await withTask(taskId, (u, t, subs) => canContribute(u, ctx(t), subs));
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
  const r = await withTask(taskId, (u, t, subs) => canContribute(u, ctx(t), subs));
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
  const r = await withTask(taskId, (u, t, subs) => canContribute(u, ctx(t), subs));
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
    select: { id: true, taskId: true, title: true, kind: true, createdById: true, blobId: true },
  });
  if (!attachment) return { ok: false, error: "That attachment is already gone." };
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
  const r = await withTask(taskId, (u, t, subs) => canContribute(u, ctx(t), subs));
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
  return withTask(item.taskId, (u, t, subs) => canContribute(u, ctx(t), subs));
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
