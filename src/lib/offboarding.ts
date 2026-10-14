import "server-only";
import { db } from "@/lib/db";
import { shareCalendar, teamConnection } from "@/lib/google/calendar";
import { inviteEmailOf } from "@/lib/meetings";

/**
 * Loose ends when someone leaves: their open meeting requests are withdrawn (so a
 * founder can't accept one and email them a Meet link), pending availability asks
 * are closed, and their address loses read access to the shared team calendar.
 * Best effort — never blocks the offboarding itself.
 */
export async function closeOutAfterLeaving(userId: string) {
  await db.meeting
    .updateMany({ where: { organizerId: userId, status: "REQUESTED", respondedAt: null }, data: { status: "CANCELLED" } })
    .catch((e) => console.error("withdrawing requests on offboarding failed", e));
  await db.availabilityRequest
    .updateMany({ where: { requesterId: userId, status: "PENDING" }, data: { status: "DECLINED", decidedAt: new Date() } })
    .catch((e) => console.error("closing availability asks on offboarding failed", e));
  try {
    const team = await teamConnection();
    if (!team || team.lastError) return;
    const people = await db.user.findMany({ where: { status: { not: "INACTIVE" } }, select: { email: true, calendarEmail: true } });
    await shareCalendar(team, people.map(inviteEmailOf), { prune: true, add: false });
  } catch (e) {
    console.error("removing team-calendar access on offboarding failed", e);
  }
}
