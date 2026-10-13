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
import { meetLinkOf } from "@/lib/google/events";
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

  return createScheduled({ user, title: d.title, description: d.description, startAt, endAt, people, meet: d.meet, instant: false });
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
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
  people: NonNullable<Awaited<ReturnType<typeof activePeople>>>;
  meet: boolean;
  instant: boolean;
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
  });
}

const requestSchema = z.object({
  founderId: z.string().min(1),
  title: z.string().trim().min(2, "Say what it's about.").max(200),
  description: z.string().trim().max(5000).optional().default(""),
  startAt: z.iso.datetime({ offset: true, message: "Suggest a time." }),
  durationMin: z.number().int().min(10).max(4 * 60),
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

  const meeting = await db.meeting.create({
    data: {
      title: d.title,
      description: d.description || null,
      startAt,
      endAt: new Date(startAt.getTime() + d.durationMin * MINUTE),
      status: "REQUESTED",
      organizerId: user.id,
      hostId: founder.id,
    },
    select: { id: true },
  });
  const tz = await getTimeZone();
  await notify([founder.id], {
    kind: "MEETING",
    actorId: user.id,
    title: `${fullName(user)} asked to meet you`,
    body: `"${d.title}" · ${formatDateTime(startAt, tz)} (${d.durationMin} min)`,
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

  let event;
  try {
    event = await createEvent(conn, {
      title: meeting.title,
      description: [meeting.description, `Requested by ${fullName(meeting.organizer)} through the Focus Realm Workspace.`].filter(Boolean).join("\n\n"),
      startAt,
      endAt,
      timeZone: tz,
      attendeeEmails: conn.kind === "TEAM" ? [inviteEmailOf(user), inviteEmailOf(meeting.organizer)] : [inviteEmailOf(meeting.organizer)],
      meet: true,
      requestId: meeting.id,
    });
  } catch (error) {
    return googleFailure(error, "Couldn't add it to your calendar");
  }
  const meetUrl = meetLinkOf(event);
  await db.meeting.update({
    where: { id: meetingId },
    data: {
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
      attendees: { select: { userId: true } },
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
  await db.meeting.update({ where: { id: meetingId }, data: { status: "CANCELLED" } });
  await notify(
    [meeting.organizerId, ...(meeting.hostId ? [meeting.hostId] : []), ...meeting.attendees.map((a) => a.userId)],
    { kind: "MEETING", actorId: user.id, title: `${user.firstName} cancelled "${meeting.title}"`, href: "/calendar" },
  );
  refresh();
  return { ok: true, message: meeting.status === "REQUESTED" ? "Request withdrawn." : "Meeting cancelled — everyone's been told." };
}

/** When a founder is busy on a given day (times only), to pick a slot that works. */
export async function founderBusyTimes(founderId: string, dayStartIso: string): Promise<ActionResult<{ busy: { start: string; end: string }[] } | null>> {
  await requireUser();
  const founder = await db.user.findFirst({ where: { id: founderId, role: "FOUNDER" }, select: { id: true } });
  if (!founder) return { ok: false, error: "Pick one of the founders." };
  const conn = await personalConnection(founder.id);
  if (!conn || conn.lastError || !googleConfig.configured()) return { ok: true, data: null };
  const from = new Date(dayStartIso);
  if (Number.isNaN(from.getTime())) return { ok: false, error: "Pick a day." };
  try {
    return { ok: true, data: { busy: await busyTimes(conn, from, new Date(from.getTime() + 24 * 3600_000)) } };
  } catch {
    return { ok: true, data: null };
  }
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
