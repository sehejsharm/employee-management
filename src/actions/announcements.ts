"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { isFounder, isLeader } from "@/lib/permissions";
import { notify } from "@/lib/notifications";
import { config } from "@/lib/env";
import { formatBytes } from "@/lib/utils";
import type { ActionResult } from "@/lib/utils";

const schema = z.object({
  title: z.string().trim().min(3, "Give it a headline.").max(160),
  body: z.string().trim().min(3, "Write the announcement.").max(10000),
  pinned: z.boolean(),
});

/** Form fields: title, body, pinned ("true"/"false") and an optional `pdf` file. */
export async function postAnnouncement(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!isLeader(user)) return { ok: false, error: "Only founders and management can post announcements." };
  const parsed = schema.safeParse({
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    pinned: formData.get("pinned") === "true",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  let pdf: { pdf: Uint8Array<ArrayBuffer>; pdfName: string; pdfSize: number } | undefined;
  const file = formData.get("pdf");
  if (file instanceof File && file.size > 0) {
    const max = config.maxUploadBytes();
    if (file.size > max) return { ok: false, error: `PDFs can be up to ${formatBytes(max)}.` };
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Check the file itself, not just its name: it must start with the PDF signature.
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") return { ok: false, error: "Attach a PDF file." };
    const name = file.name.replace(/[\\/\0]/g, "_").slice(0, 200) || "document.pdf";
    pdf = { pdf: bytes, pdfName: /\.pdf$/i.test(name) ? name : `${name}.pdf`, pdfSize: file.size };
  }

  const a = await db.announcement.create({ data: { ...parsed.data, ...pdf, authorId: user.id }, select: { id: true, title: true } });
  const everyone = await db.user.findMany({ where: { status: { not: "INACTIVE" } }, select: { id: true } });
  await notify(
    everyone.map((u) => u.id),
    { kind: "ANNOUNCEMENT", actorId: user.id, title: `${user.firstName}: ${a.title}`, body: parsed.data.body.slice(0, 140), href: "/announcements" },
  );
  refresh();
  return { ok: true, message: "Announcement posted — everyone has been notified." };
}

async function own(id: string) {
  const user = await requireUser();
  const a = await db.announcement.findUnique({ where: { id }, select: { authorId: true, pinned: true } });
  if (!a) return { error: "That announcement is gone." } as const;
  if (a.authorId !== user.id && !isFounder(user)) return { error: "Only the author or a founder can change this." } as const;
  return { a } as const;
}

export async function togglePin(id: string): Promise<ActionResult> {
  const r = await own(id);
  if ("error" in r) return { ok: false, error: r.error! };
  await db.announcement.update({ where: { id }, data: { pinned: !r.a.pinned } });
  refresh();
  return { ok: true, message: r.a.pinned ? "Unpinned." : "Pinned to the top." };
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  const r = await own(id);
  if ("error" in r) return { ok: false, error: r.error! };
  await db.announcement.delete({ where: { id } });
  refresh();
  return { ok: true, message: "Deleted." };
}
