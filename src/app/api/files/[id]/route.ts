import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getClearedIds } from "@/lib/clearance";
import { canViewTask, isFounder } from "@/lib/permissions";
import { signedDownloadUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Types safe to show inline in the browser. Everything else is forced to download. */
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf|text\/plain)$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const attachment = await db.attachment.findUnique({
    where: { id },
    select: {
      kind: true,
      fileName: true,
      mimeType: true,
      createdById: true,
      blob: { select: { data: true, storageKey: true } },
      task: { select: { createdById: true, archivedAt: true, assignees: { select: { userId: true, user: { select: { role: true } } } } } },
    },
  });
  if (!attachment || attachment.kind !== "FILE" || !attachment.blob || (!attachment.blob.data && !attachment.blob.storageKey)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  // Files stay in their owner's drive after a task is archived: founders and whoever uploaded it can still open them.
  if (attachment.task.archivedAt && !isFounder(user) && attachment.createdById !== user.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Your own uploads stay yours (your drive), even after you're taken off the task.
  const allowed = attachment.createdById === user.id || canViewTask(
    user,
    {
      createdById: attachment.task.createdById,
      assigneeIds: attachment.task.assignees.map((a) => a.userId),
      involvesFounder: attachment.task.assignees.some((a) => a.user.role === "FOUNDER"),
    },
    await getClearedIds(user),
  );
  if (!allowed) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const mime = attachment.mimeType || "application/octet-stream";
  const inline = INLINE.test(mime) && request.nextUrl.searchParams.get("download") !== "1";
  const name = attachment.fileName || "file";

  if (attachment.blob.storageKey) {
    const url = await signedDownloadUrl(attachment.blob.storageKey, { fileName: name, contentType: mime, inline });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  }

  return new NextResponse(Buffer.from(attachment.blob.data!), {
    headers: {
      "Content-Type": inline ? mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}
