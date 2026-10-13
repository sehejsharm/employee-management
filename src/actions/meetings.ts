"use server";

import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { googleConfig } from "@/lib/google/config";
import {
  GoogleError,
  busyTimes,
  createEvent,
  deleteEvent,
  personalConnection,
  revoke,
  shareCalendar,
  teamConnection,
} from "@/lib/google/calendar";
import { freeSlots, meetLinkOf } from "@/lib/google/events";
import { canCancelMeeting, inviteEmailOf } from "@/lib/meetings";
import { isFounder } from "@/lib/permissions";
import { formatDateTime } from "@/lib/time";
import { getTimeZone } from "@/lib/tz.server";
import { fullName, type ActionResult } from "@/lib/utils";

const MINUTE = 60_000;

function googleFailure(error: unknown, what: string): { ok: false; error: string } {
  if (error instanceof GoogleError) {
    return {
      ok: false,
      error: error.reconnect ? `${what}: the Google connection has expired — a founder needs to connect it again on the Calendar page.` : `${what}: ${error.message}`,
    };
  }
  console.error(what, error);
  return { ok: false, error: `${what}: Google Calendar didn't respond. Try again in a minute.` };
}

/** The team calendar, or a plain explanation of why it isn't available. */
async function usableTeamCalendar() {
  if (!googleConfig.configured()) return { error: "Google Calendar isn't set up for this workspace yet." } as const;
  const conn = await teamConnection();
  if (!conn) return { error: "The team calendar isn't connected yet — a founder can connect it on the Calendar page." } as const;
  if (conn.lastError) return { error: "The team calendar's Google connection has expired — a founder needs to connect it again." } as const;
  return { conn } as const;
}

async function activePeople(ids: string[]) {
  const unique = [...new Set(ids)];
  const people = await db.user.findMany({
    where: { id: { in: unique }, status: { not: "INACTIVE" } },
    select: { id: true, firstName: true, lastName: true, email: true, calendarEmail: true, role: true },
  });
  return people.length === unique.length ? people : null;
}

const scheduleSchema = z.object({
  title: z.string().trim().min(2, "Give the meeting a title.").max(200),
  description: z.string().trim().max(5000).optional().default(""),
  startAt: z.iso.datetime({ offset: true, message: "Pick when it starts." }),
  durationMin: z.number().int().min(10, "At least 10 minutes.").max(8 * 60, "At most 8 hours."),
  attendeeIds: z.array(z.string().min(1)).min(1, "Invite at least one person.").max(50),
  meet: z.boolean().optional().default(true),
  /** Only the people invited can see it; on the shared calendar everyone else sees "busy". */
  private: z.boolean().optional().default(true),
});

/**
 * Schedules a meeting on the shared team calendar. Google emails an invitation
 * to everyone — founders at the calendar they use (e.g. a personal Gmail) —
 * with a Google Meet link.
 */
export async function scheduleMeeting(input: z.input<typeof scheduleSchema>): Promise<ActionResult<{ id: string; meetUrl: string | null }>> {
  const user = await requireUser();
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const startAt = new Date(d.startAt);
  if (startAt.getTime() < Date.now() - 5 * MINUTE) return { ok: false, error: "That time has already passed." };
  const endAt = new Date(startAt.getTime() + d.durationMin * MINUTE);

  const team = await usableTeamCalendar();
  if ("error" in team) return { ok: false, error: team.error! };
  const people = await activePeople(d.attendeeIds.filter((id) => id !== user.id));
  if (!people) return { ok: false, error: "One of the people invited is no longer active." };
  if (people.length === 0) return { ok: false, error: "Invite at least one other person." };

  return createScheduled({ user, title: d.title, description: d.description, startAt, endAt, people, meet: d.meet, instant: false, isPrivate: d.private });
}

async function createScheduled({
  user,
  title,
  description,
  startAt,
  endAt,
  people,
  meet,
  instant,
  isPrivate,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
  people: NonNullable<Awaited<ReturnType<typeof activePeople>>>;
  meet: boolean;
  instant: boolean;
  isPrivate: boolean;
}): Promise<ActionResult<{ id: string; meetUrl: string | null }>> {
  const team = await usableTeamCalendar();
  if ("error" in team) return { ok: false, error: team.error! };
  const id = randomUUID();
  let event;
  try {
    event = await createEvent(team.conn, {
      title,
      description: [description, `Arranged by ${fullName(user)} in the Focus Realm Workspace.`].filter(Boolean).join("\n\n"),
      startAt,
      endAt,
      timeZone: await getTimeZone(),
      attendeeEmails: [inviteEmailOf(user), ...people.map(inviteEmailOf)],
      meet,
      requestId: id,
      private: isPrivate,
    });
  } catch (error) {
    return googleFailure(error, "Couldn't add it to the team calendar");
  }
  const meetUrl = meetLinkOf(event);

  await db.meeting.create({
    data: {
      id,
      title,
      description: description || null,
      startAt,
      endAt,
      instant,
      status: "SCHEDULED",
      organizerId: user.id,
      calendarKind: "TEAM",
      googleCalendarId: team.conn.calendarId,
      googleEventId: event.id,
      htmlLink: event.htmlLink ?? null,
      meetUrl,
      attendees: { create: people.map((p) => ({ userId: p.id })) },
    },
  });

  const tz = await getTimeZone();
  await notify(
    people.map((p) => p.id),
    instant
      ? { kind: "MEETING", actorId: user.id, title: `${user.firstName} is calling you on Google Meet`, body: "Join now — the call has started.", href: meetUrl ?? "/calendar" }
      : { kind: "MEETING", actorId: user.id, title: `${user.firstName} invited you to "${title}"`, body: `${formatDateTime(startAt, tz)}${meetUrl ? " · Google Meet" : ""}`, href: "/calendar" },
  );
  refresh();
  return { ok: true, data: { id, meetUrl }, message: instant ? "Call started." : "Meeting scheduled — invitations are on their way." };
}

/** "Meet now": an instant Google Meet call with one or more colleagues. */
export async function meetNow(userIds: string[]): Promise<ActionResult<{ id: string; meetUrl: string | null }>> {
  const user = await requireUser();
  const people = await activePeople(userIds.filter((id) => id !== user.id));
  if (!people || people.length === 0) return { ok: false, error: "Pick someone current to call." };
  const startAt = new Date();
  const names = people.map((p) => p.firstName).join(", ");
  return createScheduled({
    user,
    title: `Call: ${user.firstName} ↔ ${names}`,
    description: "Instant call started from the Focus Realm Workspace.",
    startAt,
    endAt: new Date(startAt.getTime() + 30 * MINUTE),
    people,
    meet: true,
    instant: true,
    isPrivate: true,
  });
}

const requestSchema = z.object({
  founderId: z.string().min(1),
  title: z.string().trim().min(2, "Say what it's about.").max(200),
  description: z.string().trim().max(5000).optional().default(""),
  startAt: z.iso.datetime({ offset: true, message: "Suggest a time." }),
  /** Length of each slot. With one slot, the length of the meeting. */
  durationMin: z.number().int().min(10).max(4 * 60),
  /** Back-to-back slots in one block, each with its own Meet link (e.g. 4 interviews of 15 min). */
  slots: z.number().int().min(1).max(12).optional().default(1),
  /** Optional name of whoever each slot is for, e.g. the candidate. */
  guests: z.array(z.string().trim().max(120)).max(12).optional().default([]),
});

/** Asks a founder for time. Nothing is booked until they accept. */
export async function requestFounderMeeting(input: z.input<typeof requestSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.founderId === user.id) return { ok: false, error: "You can't request a meeting with yourself." };
  const founder = await db.user.findFirst({ where: { id: d.founderId, role: "FOUNDER", status: { not: "INACTIVE" } }, select: { id: true, firstName: true } });
  if (!founder) return { ok: false, error: "Pick one of the founders." };
  const startAt = new Date(d.startAt);
  if (startAt.getTime() < Date.now() - 5 * MINUTE) return { ok: false, error: "That time has already passed." };
  if (d.slots * d.durationMin > 8 * 60) return { ok: false, error: "Keep the whole block under 8 hours." };

  const slotMs = d.durationMin * MINUTE;
  const meeting = await db.meeting.create({
    data: {
      title: d.title,
      description: d.description || null,
      startAt,
      endAt: new Date(startAt.getTime() + d.slots * slotMs),
      status: "REQUESTED",
      organizerId: user.id,
      hostId: founder.id,
      slots:
        d.slots > 1
          ? {
              create: Array.from({ length: d.slots }, (_, i) => ({
                position: i + 1,
                startAt: new Date(startAt.getTime() + i * slotMs),
                endAt: new Date(startAt.getTime() + (i + 1) * slotMs),
                guestName: d.guests[i] || null,
              })),
            }
          : undefined,
    },
    select: { id: true },
  });
  const tz = await getTimeZone();
  await notify([founder.id], {
    kind: "MEETING",
    actorId: user.id,
    title: `${fullName(user)} asked to meet you`,
    body: `"${d.title}" · ${formatDateTime(startAt, tz)} (${d.slots > 1 ? `${d.slots} × ${d.durationMin} min` : `${d.durationMin} min`})`,
    href: `/calendar#request-${meeting.id}`,
  });
  refresh();
  return { ok: true, message: `Request sent to ${founder.firstName}. You'll hear back here.` };
}

const respondSchema = z.object({
  accept: z.boolean(),
  /** A founder can accept at a different time. */
  startAt: z.iso.datetime({ offset: true }).optional(),
  note: z.string().trim().max(1000).optional().default(""),
});

/**
 * A founder answers a request. Accepting puts it on their own Google Calendar
 * (or the team calendar if theirs isn't connected) with a Meet link, and
 * invites the person who asked.
 */
export async function respondToMeetingRequest(meetingId: string, input: z.input<typeof respondSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      title: true,
      description: true,
      startAt: true,
      endAt: true,
      status: true,
      hostId: true,
      organizer: { select: { id: true, firstName: true, lastName: true, email: true, calendarEmail: true, status: true } },
      slots: { orderBy: { position: "asc" }, select: { id: true, position: true, startAt: true, endAt: true, guestName: true } },
    },
  });
  if (!meeting || meeting.status !== "REQUESTED") return { ok: false, error: "That request has already been answered." };
  if (meeting.hostId !== user.id) return { ok: false, error: "Only the founder it was sent to can answer it." };
  const tz = await getTimeZone();

  if (!d.accept) {
    await db.meeting.update({ where: { id: meetingId }, data: { status: "DECLINED", responseNote: d.note || null, respondedAt: new Date() } });
    await notify([meeting.organizer.id], {
      kind: "MEETING",
      actorId: user.id,
      title: `${user.firstName} can't meet for "${meeting.title}"`,
      body: d.note || "Suggest another time if it's still needed.",
      href: "/calendar",
    });
    refresh();
    return { ok: true, message: "Declined — they've been told." };
  }

  const startAt = d.startAt ? new Date(d.startAt) : meeting.startAt;
  const endAt = new Date(startAt.getTime() + (meeting.endAt.getTime() - meeting.startAt.getTime()));
  if (startAt.getTime() < Date.now() - 5 * MINUTE) return { ok: false, error: "That time has passed — pick a new one before accepting." };

  // The founder's own calendar first, so it lands where they actually look.
  const own = await personalConnection(user.id);
  const team = await teamConnection();
  const conn = own && !own.lastError ? own : team && !team.lastError ? team : null;
  if (!conn) return { ok: false, error: "Connect your Google Calendar (or the team calendar) on the Calendar page first." };

  // "Saumitra Rao × Sehej Sharma — topic": who's meeting whom, at a glance on any calendar.
  const pairTitle = `${fullName(meeting.organizer)} × ${fullName(user)} — ${meeting.title}`;
  const details = [meeting.description, `Requested by ${fullName(meeting.organizer)} through the Focus Realm Workspace.`].filter(Boolean).join("\n\n");
  const attendeeEmails = conn.kind === "TEAM" ? [inviteEmailOf(user), inviteEmailOf(meeting.organizer)] : [inviteEmailOf(meeting.organizer)];

  if (meeting.slots.length > 1) {
    return acceptSlots({ user, meeting, conn, team, startAt, endAt, pairTitle, details, attendeeEmails, note: d.note, tz });
  }

  let event;
  try {
    event = await createEvent(conn, {
      title: pairTitle,
      description: details,
      startAt,
      endAt,
      timeZone: tz,
      attendeeEmails,
      meet: true,
      requestId: meeting.id,
    });
  } catch (error) {
    return googleFailure(error, "Couldn't add it to your calendar");
  }
  const meetUrl = meetLinkOf(event);

  // The founder's calendar holds the real meeting; the shared team calendar gets a copy
  // so everyone can see it. No invites from the copy — they already came from the real one.
  let teamEventId: string | null = null;
  if (conn.kind === "PERSONAL" && team && !team.lastError) {
    try {
      const copy = await createEvent(team, {
        title: pairTitle,
        description: [details, meetUrl ? `Google Meet: ${meetUrl}` : null].filter(Boolean).join("\n\n"),
        startAt,
        endAt,
        timeZone: tz,
        attendeeEmails: [],
        meet: false,
        requestId: `${meeting.id}-team`,
        location: meetUrl,
      });
      teamEventId = copy.id;
    } catch (error) {
      // The meeting itself is booked; a missing copy on the shared calendar isn't worth failing over.
      console.error("Couldn't copy the founder meeting to the team calendar", error);
    }
  }

  await db.meeting.update({
    where: { id: meetingId },
    data: {
      teamEventId,
      status: "SCHEDULED",
      startAt,
      endAt,
      respondedAt: new Date(),
      responseNote: d.note || null,
      calendarKind: conn.kind,
      googleCalendarId: conn.calendarId,
      googleEventId: event.id,
      htmlLink: event.htmlLink ?? null,
      meetUrl,
      attendees: { create: [{ userId: meeting.organizer.id }] },
    },
  });
  await notify([meeting.organizer.id], {
    kind: "MEETING",
    actorId: user.id,
    title: `${user.firstName} accepted "${meeting.title}"`,
    body: `${formatDateTime(startAt, tz)}${startAt.getTime() !== meeting.startAt.getTime() ? " (new time)" : ""}${meetUrl ? " · Google Meet" : ""}`,
    href: "/calendar",
  });
  refresh();
  return { ok: true, message: "Accepted — it's on your calendar and they've been invited." };
}

type Conn = NonNullable<Awaited<ReturnType<typeof teamConnection>>>;

/**
 * Accepts a multi-slot request: one event per slot on the founder's calendar, each with
 * its own Meet link so every guest gets a separate call, plus one block on the team calendar.
 */
async function acceptSlots(a: {
  user: Awaited<ReturnType<typeof requireUser>>;
  meeting: {
    id: string;
    title: string;
    startAt: Date;
    organizer: { id: string; firstName: string; lastName: string };
    slots: { id: string; position: number; startAt: Date; endAt: Date; guestName: string | null }[];
  };
  conn: Conn;
  team: Conn | null;
  startAt: Date;
  endAt: Date;
  pairTitle: string;
  details: string;
  attendeeEmails: string[];
  note: string;
  tz: string;
}): Promise<ActionResult> {
  const { meeting, conn, tz } = a;
  const shift = a.startAt.getTime() - meeting.startAt.getTime();
  const total = meeting.slots.length;
  const created: { slotId: string; startAt: Date; endAt: Date; eventId: string; meetUrl: string | null; htmlLink: string | null; label: string }[] = [];
  try {
    for (const slot of meeting.slots) {
      const startAt = new Date(slot.startAt.getTime() + shift);
      const endAt = new Date(slot.endAt.getTime() + shift);
      const label = `Slot ${slot.position}/${total}${slot.guestName ? ` — ${slot.guestName}` : ""}`;
      const event = await createEvent(conn, {
        title: `${a.pairTitle} · ${label}`,
        description: a.details,
        startAt,
        endAt,
        timeZone: tz,
        attendeeEmails: a.attendeeEmails,
        meet: true,
        requestId: `${meeting.id}-s${slot.position}`,
      });
      created.push({ slotId: slot.id, startAt, endAt, eventId: event.id, meetUrl: meetLinkOf(event), htmlLink: event.htmlLink ?? null, label });
    }
  } catch (error) {
    // All or nothing: don't leave half the slots booked.
    await Promise.all(created.map((c) => deleteEvent(conn, conn.calendarId, c.eventId).catch(() => undefined)));
    return googleFailure(error, "Couldn't add the slots to your calendar");
  }

  let teamEventId: string | null = null;
  if (conn.kind === "PERSONAL" && a.team && !a.team.lastError) {
    try {
      const copy = await createEvent(a.team, {
        title: `${a.pairTitle} (${total} slots)`,
        description: [a.details, ...created.map((c) => `${c.label}: ${formatDateTime(c.startAt, tz)}${c.meetUrl ? ` · ${c.meetUrl}` : ""}`)].join("\n\n"),
        startAt: a.startAt,
        endAt: a.endAt,
        timeZone: tz,
        attendeeEmails: [],
        meet: false,
        requestId: `${meeting.id}-team`,
      });
      teamEventId = copy.id;
    } catch (error) {
      console.error("Couldn't copy the founder meeting to the team calendar", error);
    }
  }

  await db.$transaction([
    ...created.map((c) =>
      db.meetingSlot.update({
        where: { id: c.slotId },
        data: { startAt: c.startAt, endAt: c.endAt, googleEventId: c.eventId, meetUrl: c.meetUrl, htmlLink: c.htmlLink },
      }),
    ),
    db.meeting.update({
      where: { id: meeting.id },
      data: {
        teamEventId,
        status: "SCHEDULED",
        startAt: a.startAt,
        endAt: a.endAt,
        respondedAt: new Date(),
        responseNote: a.note || null,
        calendarKind: conn.kind,
        googleCalendarId: conn.calendarId,
        googleEventId: null,
        htmlLink: created[0]?.htmlLink ?? null,
        meetUrl: created[0]?.meetUrl ?? null,
        attendees: { create: [{ userId: meeting.organizer.id }] },
      },
    }),
  ]);
  await notify([meeting.organizer.id], {
    kind: "MEETING",
    actorId: a.user.id,
    title: `${a.user.firstName} accepted "${meeting.title}" (${total} slots)`,
    body: `${formatDateTime(a.startAt, tz)}${shift ? " (new time)" : ""} · a separate Meet link for each slot — copy the guest invites from Calendar`,
    href: "/calendar",
  });
  refresh();
  return { ok: true, message: `Accepted — ${total} slots are on your calendar, each with its own Meet link.` };
}

/** Cancels a meeting (or withdraws a request) and tells everyone. */
export async function cancelMeeting(meetingId: string): Promise<ActionResult> {
  const user = await requireUser();
  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      title: true,
      status: true,
      organizerId: true,
      hostId: true,
      calendarKind: true,
      googleCalendarId: true,
      googleEventId: true,
      teamEventId: true,
      attendees: { select: { userId: true } },
      slots: { select: { googleEventId: true } },
    },
  });
  if (!meeting || meeting.status === "CANCELLED" || meeting.status === "DECLINED") return { ok: false, error: "That meeting is already off." };
  if (!canCancelMeeting(user, meeting)) return { ok: false, error: "Only whoever arranged it, or a founder, can cancel it." };

  if (meeting.googleEventId && meeting.googleCalendarId) {
    const conn =
      meeting.calendarKind === "PERSONAL" && meeting.hostId ? await personalConnection(meeting.hostId) : await teamConnection();
    if (conn) {
      try {
        await deleteEvent(conn, meeting.googleCalendarId, meeting.googleEventId);
      } catch (error) {
        return googleFailure(error, "Couldn't remove it from Google Calendar");
      }
    }
  }
  const slotEvents = meeting.slots.map((s) => s.googleEventId).filter((id): id is string => !!id);
  if (slotEvents.length && meeting.googleCalendarId) {
    const conn = meeting.calendarKind === "PERSONAL" && meeting.hostId ? await personalConnection(meeting.hostId) : await teamConnection();
    if (conn) {
      const calendarId = meeting.googleCalendarId;
      const results = await Promise.allSettled(slotEvents.map((id) => deleteEvent(conn, calendarId, id)));
      const failed = results.find((r) => r.status === "rejected");
      if (failed) return googleFailure((failed as PromiseRejectedResult).reason, "Couldn't remove every slot from Google Calendar");
    }
  }
  if (meeting.teamEventId) {
    const team = await teamConnection();
    if (team) await deleteEvent(team, team.calendarId, meeting.teamEventId).catch((e) => console.error("Couldn't remove the team-calendar copy", e));
  }
  await db.meeting.update({ where: { id: meetingId }, data: { status: "CANCELLED" } });
  await notify(
    [meeting.organizerId, ...(meeting.hostId ? [meeting.hostId] : []), ...meeting.attendees.map((a) => a.userId)],
    { kind: "MEETING", actorId: user.id, title: `${user.firstName} cancelled "${meeting.title}"`, href: "/calendar" },
  );
  refresh();
  return { ok: true, message: meeting.status === "REQUESTED" ? "Request withdrawn." : "Meeting cancelled — everyone's been told." };
}

const AVAILABILITY_DAYS = 14;

export type AvailabilityAccess =
  | { access: "none" | "declined" | "pending" | "unavailable" }
  | { access: "granted"; until: string; slots: string[] };

/**
 * A founder's open slots on a day — only for people the founder has allowed to see
 * them. Busy blocks themselves never leave the server.
 */
export async function founderAvailability(founderId: string, dayStartIso: string, minutes: number): Promise<ActionResult<AvailabilityAccess>> {
  const user = await requireUser();
  const founder = await db.user.findFirst({ where: { id: founderId, role: "FOUNDER" }, select: { id: true } });
  if (!founder) return { ok: false, error: "Pick one of the founders." };
  const latest = await db.availabilityRequest.findFirst({
    where: { requesterId: user.id, founderId },
    orderBy: { createdAt: "desc" },
    select: { status: true, expiresAt: true },
  });
  const granted = latest?.status === "APPROVED" && latest.expiresAt && latest.expiresAt > new Date();
  if (!granted) {
    return { ok: true, data: { access: latest?.status === "PENDING" ? "pending" : latest?.status === "DECLINED" ? "declined" : "none" } };
  }
  const conn = await personalConnection(founder.id);
  const from = new Date(dayStartIso);
  if (!conn || conn.lastError || !googleConfig.configured() || Number.isNaN(from.getTime())) return { ok: true, data: { access: "unavailable" } };
  try {
    const busy = await busyTimes(conn, from, new Date(from.getTime() + 24 * 3600_000));
    return { ok: true, data: { access: "granted", until: latest!.expiresAt!.toISOString(), slots: freeSlots(busy, from, Math.min(Math.max(minutes, 15), 8 * 60)) } };
  } catch {
    return { ok: true, data: { access: "unavailable" } };
  }
}

const askSchema = z.object({
  founderId: z.string().min(1),
  purpose: z.string().trim().min(5, "Say what the meetings are for.").max(1000),
  meetings: z.number().int().min(1).max(50),
  slotMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90)]),
});

/** Asks a founder to see when they're free, saying why and how much time is needed. */
export async function askFounderAvailability(input: z.input<typeof askSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.founderId === user.id) return { ok: false, error: "That's you." };
  const founder = await db.user.findFirst({ where: { id: d.founderId, role: "FOUNDER", status: { not: "INACTIVE" } }, select: { id: true, firstName: true } });
  if (!founder) return { ok: false, error: "Pick one of the founders." };
  const pending = await db.availabilityRequest.findFirst({ where: { requesterId: user.id, founderId: founder.id, status: "PENDING" }, select: { id: true } });
  if (pending) return { ok: false, error: `You've already asked ${founder.firstName} — waiting for an answer.` };

  await db.availabilityRequest.create({ data: { requesterId: user.id, founderId: founder.id, purpose: d.purpose, meetings: d.meetings, slotMinutes: d.slotMinutes } });
  await notify([founder.id], {
    kind: "MEETING",
    actorId: user.id,
    title: `${fullName(user)} is asking to see when you're free`,
    body: `${d.meetings} meeting${d.meetings === 1 ? "" : "s"} of ${d.slotMinutes} min — ${d.purpose}`.slice(0, 200),
    href: "/calendar",
  });
  refresh();
  return { ok: true, message: `Asked ${founder.firstName}. You'll be told when they answer.` };
}

/** A founder lets someone see their open slots (for two weeks), or says no. */
export async function answerAvailabilityRequest(id: string, input: { approve: boolean; note?: string }): Promise<ActionResult> {
  const user = await requireUser();
  const req = await db.availabilityRequest.findUnique({ where: { id }, select: { founderId: true, requesterId: true, status: true, meetings: true, slotMinutes: true } });
  if (!req || req.status !== "PENDING") return { ok: false, error: "That request has already been answered." };
  if (req.founderId !== user.id) return { ok: false, error: "Only the founder it was sent to can answer it." };
  const note = String(input.note ?? "").trim().slice(0, 500) || null;
  const expiresAt = input.approve ? new Date(Date.now() + AVAILABILITY_DAYS * 24 * 3600_000) : null;
  await db.availabilityRequest.update({ where: { id }, data: { status: input.approve ? "APPROVED" : "DECLINED", decidedAt: new Date(), expiresAt, note } });
  await notify([req.requesterId], {
    kind: "MEETING",
    actorId: user.id,
    title: input.approve ? `${user.firstName} shared when they're free` : `${user.firstName} didn't share their availability`,
    body: input.approve
      ? `Pick your ${req.meetings === 1 ? "slot" : `${req.meetings} slots`} of ${req.slotMinutes} min on the Calendar page — open for ${AVAILABILITY_DAYS} days.`
      : note || "Suggest a time in a meeting request instead.",
    href: "/calendar",
  });
  refresh();
  return { ok: true, message: input.approve ? `Shared for ${AVAILABILITY_DAYS} days.` : "Declined — they've been told." };
}

/** Lets everyone see the team calendar, so they can add it in their own Google Calendar. */
export async function shareTeamCalendar(): Promise<ActionResult> {
  const user = await requireUser();
  if (!isFounder(user)) return { ok: false, error: "Only founders can share the team calendar." };
  const team = await usableTeamCalendar();
  if ("error" in team) return { ok: false, error: team.error! };
  const people = await db.user.findMany({ where: { status: { not: "INACTIVE" } }, select: { email: true, calendarEmail: true } });
  try {
    const res = await shareCalendar(team.conn, people.map(inviteEmailOf));
    await audit({ actorId: user.id, action: "google.team_shared", targetType: "workspace", summary: `Shared the team calendar with ${res.shared} new address${res.shared === 1 ? "" : "es"}` });
    return {
      ok: true,
      message: `Shared with ${res.shared} new ${res.shared === 1 ? "address" : "addresses"}.${res.failed.length ? ` Couldn't share with ${res.failed.join(", ")}.` : ""}`,
    };
  } catch (error) {
    return googleFailure(error, "Couldn't share the team calendar");
  }
}

/** Disconnects a Google account: your own calendar, or (founders) the team calendar. */
export async function disconnectGoogle(kind: "personal" | "team"): Promise<ActionResult> {
  const user = await requireUser();
  if (!isFounder(user)) return { ok: false, error: "Only founders manage Google connections." };
  const conn = kind === "team" ? await teamConnection() : await personalConnection(user.id);
  if (!conn) return { ok: true };
  await revoke(conn);
  await db.googleConnection.delete({ where: { id: conn.id } });
  await audit({
    actorId: user.id,
    action: kind === "team" ? "google.team_disconnected" : "google.personal_disconnected",
    targetType: kind === "team" ? "workspace" : "user",
    targetId: kind === "team" ? null : user.id,
    summary: kind === "team" ? `Disconnected the team calendar (${conn.googleEmail})` : `Disconnected Google Calendar ${conn.googleEmail}`,
  });
  refresh();
  return { ok: true, message: "Disconnected." };
}

const calendarEmailSchema = z.object({ email: z.union([z.literal(""), z.email("Enter a valid email address.").max(254)]) });

/** Where your Google Calendar invites should go, if not your work email. */
export async function setCalendarEmail(input: z.input<typeof calendarEmailSchema>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = calendarEmailSchema.safeParse({ email: String(input.email ?? "").trim() });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const email = parsed.data.email.toLowerCase();
  await db.user.update({ where: { id: user.id }, data: { calendarEmail: email || null } });
  refresh();
  return { ok: true, message: email ? `Calendar invites will go to ${email}.` : "Calendar invites will go to your work email." };
}
