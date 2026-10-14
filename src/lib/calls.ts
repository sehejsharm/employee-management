import "server-only";
import { db } from "@/lib/db";
import { sendPush } from "@/lib/push";

/** How long a "Meet now" call keeps ringing. */
export const RING_MS = 90_000;
/** How often a ringing phone is buzzed again, like a phone ringing. */
const RE_RING_MS = 15_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function load(meetingId: string) {
  return db.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      instant: true,
      status: true,
      createdAt: true,
      organizer: { select: { firstName: true, lastName: true } },
      // Still waiting: not answered or turned down on any device.
      attendees: { where: { callAnswer: null, user: { status: { not: "INACTIVE" } } }, select: { userId: true } },
    },
  });
}

/**
 * Rings everyone on a "Meet now" call on their phones: a high-priority
 * notification straight away, repeated every 15 seconds until they answer or
 * turn it down (on any device), the caller hangs up, or 90 seconds pass. Anyone
 * who didn't pick up then gets a "Missed call" in its place. Run in the
 * background after the call starts.
 */
export async function ringCall(meetingId: string) {
  const rung = new Set<string>();
  let caller = "Someone";
  let waiting: string[] = [];
  for (;;) {
    const call = await load(meetingId);
    if (!call?.instant) return;
    caller = call.organizer.firstName;
    waiting = call.attendees.map((a) => a.userId);
    const elapsed = Date.now() - call.createdAt.getTime();
    if (call.status !== "SCHEDULED" || waiting.length === 0 || elapsed >= RING_MS - RE_RING_MS / 2) break;

    await sendPush(
      waiting,
      {
        kind: "call",
        title: `${call.organizer.firstName} ${call.organizer.lastName} is calling you`,
        body: "Google Meet · tap to join",
        url: `/calls/${call.id}/join`,
        tag: `call-${call.id}`,
        callId: call.id,
      },
      // A ring that arrives after the call stopped ringing is useless: let the push service drop it.
      { ttlSeconds: Math.max(5, Math.ceil((RING_MS - elapsed) / 1000)) },
    );
    for (const id of waiting) rung.add(id);
    await sleep(RE_RING_MS);
  }

  const missed = waiting.filter((id) => rung.has(id));
  if (missed.length === 0) return;
  await sendPush(missed, {
    kind: "missed",
    title: `Missed call from ${caller}`,
    body: "Tap to join if the call is still going.",
    url: `/calls/${meetingId}/join`,
    tag: `call-${meetingId}`,
  });
}
