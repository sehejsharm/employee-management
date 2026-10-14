import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/** Where someone's Google Calendar invites go: their calendar email (e.g. a founder's Gmail), else their work email. */
export const inviteEmailOf = (u: { email: string; calendarEmail: string | null }) => u.calendarEmail || u.email;

export const meetingPersonSelect = { id: true, firstName: true, lastName: true, avatarHue: true, title: true, role: true, meetingNotes: true } as const;

export const meetingSelect = {
  id: true,
  title: true,
  description: true,
  startAt: true,
  endAt: true,
  status: true,
  instant: true,
  meetUrl: true,
  htmlLink: true,
  calendarKind: true,
  responseNote: true,
  createdAt: true,
  organizer: { select: meetingPersonSelect },
  host: { select: meetingPersonSelect },
  attendees: { select: { user: { select: meetingPersonSelect } } },
  slots: { orderBy: { position: "asc" }, select: { id: true, position: true, startAt: true, endAt: true, guestName: true, meetUrl: true } },
} satisfies Prisma.MeetingSelect;

export type MeetingRow = Prisma.MeetingGetPayload<{ select: typeof meetingSelect }>;

const involving = (userId: string): Prisma.MeetingWhereInput => ({
  OR: [{ organizerId: userId }, { hostId: userId }, { attendees: { some: { userId } } }],
});

/** Everything on someone's plate: upcoming meetings, requests waiting on them, and their own requests. */
export async function meetingsFor(userId: string, now = new Date()) {
  const recent = new Date(now.getTime() - 7 * 24 * 3600_000);
  const [upcoming, toAnswer, mine] = await Promise.all([
    db.meeting.findMany({
      where: { AND: [involving(userId), { status: "SCHEDULED", endAt: { gte: now } }] },
      orderBy: { startAt: "asc" },
      take: 50,
      select: meetingSelect,
    }),
    db.meeting.findMany({ where: { hostId: userId, status: "REQUESTED" }, orderBy: { startAt: "asc" }, select: meetingSelect }),
    db.meeting.findMany({
      where: { organizerId: userId, hostId: { not: null }, OR: [{ status: "REQUESTED" }, { status: "DECLINED", respondedAt: { gte: recent } }] },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: meetingSelect,
    }),
  ]);
  return { upcoming, toAnswer, mine };
}

/** Today's meetings for the daily briefing. */
export async function meetingsToday(userId: string, from: Date, to: Date) {
  return db.meeting.findMany({
    where: { AND: [involving(userId), { status: "SCHEDULED", startAt: { gte: from, lt: to } }] },
    orderBy: { startAt: "asc" },
    select: { id: true, title: true, startAt: true, meetUrl: true },
  });
}

/** Can this person cancel the meeting: whoever arranged it, the founder it was with, or any founder. */
export function canCancelMeeting(actor: { id: string; role: string }, m: { organizerId: string; hostId: string | null }) {
  return actor.role === "FOUNDER" || m.organizerId === actor.id || m.hostId === actor.id;
}

/**
 * Can this person change the meeting (time, title, agenda, who's invited): whoever
 * arranged a team meeting, or any founder. A meeting with a founder lives on the
 * founder's calendar, so only founders move it — the person who asked can cancel
 * it or ask for another time.
 */
export function canEditMeeting(actor: { id: string; role: string }, m: { organizerId: string; hostId: string | null; instant: boolean }) {
  if (m.instant) return false;
  if (actor.role === "FOUNDER") return true;
  return m.hostId === null && m.organizerId === actor.id;
}

/** The next week of scheduled meetings someone is in, for the dashboard. */
export async function upcomingForDashboard(userId: string, now = new Date()) {
  const rows = await db.meeting.findMany({
    where: { AND: [involving(userId), { status: "SCHEDULED", endAt: { gte: now }, startAt: { lte: new Date(now.getTime() + 7 * 24 * 3600_000) } }] },
    orderBy: { startAt: "asc" },
    take: 8,
    select: meetingSelect,
  });
  return rows.map((m) => {
    const people = [m.organizer, ...(m.host ? [m.host] : []), ...m.attendees.map((a) => a.user)].filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
    // A multi-slot block: show the slot that's on now (or next), with its own link.
    const slot = m.slots.find((s) => s.endAt >= now);
    return {
      id: m.id,
      title: slot ? `${m.title} · Slot ${slot.position}/${m.slots.length}${slot.guestName ? ` — ${slot.guestName}` : ""}` : m.title,
      startAt: (slot?.startAt ?? m.startAt).toISOString(),
      endAt: (slot?.endAt ?? m.endAt).toISOString(),
      meetUrl: slot ? slot.meetUrl : m.meetUrl,
      organizer: m.organizer.id === userId ? "you" : `${m.organizer.firstName} ${m.organizer.lastName}`,
      people: people.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, avatarHue: p.avatarHue })),
    };
  });
}
