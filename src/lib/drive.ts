import "server-only";
import { db } from "@/lib/db";
import { isFounder, type Actor } from "@/lib/permissions";
import { taskVisibilityWhere } from "@/lib/tasks/queries";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Someone's drive: every file, link and note they've added to a task or handed
 * in as proof of work, plus their written hand-ins. Nothing leaves it when the
 * work is accepted, the task is done or archived — it stays with the person.
 */
export type DriveKind = "FILE" | "LINK" | "NOTE" | "WRITEUP";

export interface DriveItem {
  id: string;
  kind: DriveKind;
  title: string;
  /** LINK: the URL. FILE: the download path. */
  href: string | null;
  /** NOTE / WRITEUP: the text. */
  text: string | null;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
  /** Handed in as proof (and how it went), or added to the task as material. */
  proof: "ACCEPTED" | "SUBMITTED" | "CHANGES_REQUESTED" | null;
  task: { id: string; number: number; title: string; status: string; archived: boolean };
}

const MAX_ITEMS = 1000;

/** Which tasks' items the viewer may see in this person's drive. */
function taskScope(viewer: Actor, ownerId: string, cleared: Set<string>): Prisma.TaskWhereInput {
  // Your own drive, and founders: everything, archived tasks included.
  if (viewer.id === ownerId || isFounder(viewer)) return {};
  return { AND: [taskVisibilityWhere(viewer, cleared), { archivedAt: null }] };
}

export async function driveFor(viewer: Actor, ownerId: string, cleared: Set<string>): Promise<DriveItem[]> {
  const task = taskScope(viewer, ownerId, cleared);
  const taskSelect = { id: true, number: true, title: true, status: true, archivedAt: true } as const;
  const [attachments, writeups] = await Promise.all([
    db.attachment.findMany({
      where: { createdById: ownerId, task },
      orderBy: { createdAt: "desc" },
      take: MAX_ITEMS,
      select: {
        id: true,
        kind: true,
        title: true,
        url: true,
        content: true,
        fileName: true,
        mimeType: true,
        size: true,
        createdAt: true,
        submission: { select: { status: true } },
        task: { select: taskSelect },
      },
    }),
    db.submission.findMany({
      where: { submittedById: ownerId, summary: { not: null }, task },
      orderBy: { createdAt: "desc" },
      take: MAX_ITEMS,
      select: { id: true, summary: true, status: true, createdAt: true, task: { select: taskSelect } },
    }),
  ]);

  const items: DriveItem[] = [
    ...attachments.map((a) => ({
      id: a.id,
      kind: a.kind as DriveKind,
      title: a.title,
      href: a.kind === "FILE" ? `/api/files/${a.id}` : a.kind === "LINK" ? a.url : null,
      text: a.kind === "NOTE" ? a.content : null,
      fileName: a.fileName,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt.toISOString(),
      proof: a.submission?.status ?? null,
      task: { id: a.task.id, number: a.task.number, title: a.task.title, status: a.task.status, archived: !!a.task.archivedAt },
    })),
    ...writeups
      .filter((s) => s.summary?.trim())
      .map((s) => ({
        id: `writeup-${s.id}`,
        kind: "WRITEUP" as const,
        title: "Written hand-in",
        href: null,
        text: s.summary,
        fileName: null,
        mimeType: null,
        size: null,
        createdAt: s.createdAt.toISOString(),
        proof: s.status,
        task: { id: s.task.id, number: s.task.number, title: s.task.title, status: s.task.status, archived: !!s.task.archivedAt },
      })),
  ];
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_ITEMS);
}

/** Counts for the drive card on a profile. */
export async function driveSummary(viewer: Actor, ownerId: string, cleared: Set<string>) {
  const task = taskScope(viewer, ownerId, cleared);
  const [files, links, size] = await Promise.all([
    db.attachment.count({ where: { createdById: ownerId, kind: "FILE", task } }),
    db.attachment.count({ where: { createdById: ownerId, kind: "LINK", task } }),
    db.attachment.aggregate({ where: { createdById: ownerId, kind: "FILE", task }, _sum: { size: true } }),
  ]);
  return { files, links, bytes: size._sum.size ?? 0 };
}
