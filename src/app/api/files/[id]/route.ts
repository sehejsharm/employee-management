import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getGrantedOwnerIds } from "@/lib/auth/current-user";
import { canViewTask, taskAccess } from "@/lib/permissions";
import { taskAccessSelect } from "@/lib/tasks/queries";

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
      blob: { select: { data: true } },
      task: { select: { archivedAt: true, ...taskAccessSelect } },
    },
  });
  if (!attachment || attachment.kind !== "FILE" || !attachment.blob || attachment.task.archivedAt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Downloading is viewing: anyone who can see the task may, including through a founder's grant.
  if (!canViewTask(user, taskAccess(attachment.task), await getGrantedOwnerIds(user))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const mime = attachment.mimeType || "application/octet-stream";
  const inline = INLINE.test(mime) && request.nextUrl.searchParams.get("download") !== "1";
  const name = attachment.fileName || "file";

  return new NextResponse(Buffer.from(attachment.blob.data), {
    headers: {
      "Content-Type": inline ? mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}
