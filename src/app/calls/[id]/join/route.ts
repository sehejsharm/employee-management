import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Where a call notification on a phone leads: marks the call answered (so it
 * stops ringing everywhere else) and goes straight to Google Meet. Once the
 * call is over or was cancelled, it goes to the calendar instead.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), { headers: { "Cache-Control": "no-store" } });

  const user = await getCurrentUser();
  if (!user) return to(`/login?next=${encodeURIComponent(`/calls/${id}/join`)}`);
  if (user.mustChangePassword) return to("/welcome");

  const meeting = await db.meeting.findFirst({
    where: { id, OR: [{ organizerId: user.id }, { attendees: { some: { userId: user.id } } }] },
    select: { status: true, endAt: true, meetUrl: true },
  });
  if (!meeting) return to("/calendar");

  await db.meetingAttendee.updateMany({
    where: { meetingId: id, userId: user.id, callAnswer: null },
    data: { callAnswer: "JOINED", answeredAt: new Date() },
  });
  if (meeting.status === "SCHEDULED" && meeting.meetUrl && meeting.endAt > new Date()) {
    return NextResponse.redirect(meeting.meetUrl, { headers: { "Cache-Control": "no-store" } });
  }
  return to("/calendar");
}
