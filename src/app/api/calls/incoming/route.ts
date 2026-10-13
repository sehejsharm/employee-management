import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** How long a "Meet now" call keeps ringing. */
const RING_MS = 90_000;

/**
 * "Meet now" calls ringing for the signed-in person: instant calls started by
 * someone else in the last 90 seconds. Polled every few seconds, so it stays tiny.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const calls = await db.meeting.findMany({
    where: {
      instant: true,
      status: "SCHEDULED",
      createdAt: { gte: new Date(Date.now() - RING_MS) },
      organizerId: { not: user.id },
      attendees: { some: { userId: user.id } },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      id: true,
      meetUrl: true,
      createdAt: true,
      organizer: { select: { id: true, firstName: true, lastName: true, avatarHue: true, title: true, role: true, meetingNotes: true } },
    },
  });
  return NextResponse.json(
    {
      calls: calls
        .filter((c) => c.meetUrl)
        .map(({ organizer: { role, meetingNotes, ...organizer }, ...c }) => ({
          ...c,
          organizer: { ...organizer, meetingNotes: role === "FOUNDER" ? meetingNotes : null },
          createdAt: c.createdAt.toISOString(),
          ringUntil: new Date(c.createdAt.getTime() + RING_MS).toISOString(),
        })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
