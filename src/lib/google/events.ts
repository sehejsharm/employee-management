/**
 * Pure helpers for Google Calendar payloads — no I/O, so they're unit tested.
 */

export interface EventInput {
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  timeZone: string;
  /** Invitees' calendar emails. Duplicates (shared mailboxes) are collapsed. */
  attendeeEmails: string[];
  /** Add a Google Meet link. */
  meet: boolean;
  /** Ties the Meet request to our meeting, so a retry never makes a second link. */
  requestId: string;
  /** Shown as the event's location, e.g. the Meet link on a copy of a meeting. */
  location?: string | null;
  /** Private: on a shared calendar others see only "busy", not what it is or who's in it. */
  private?: boolean;
}

export function eventBody(input: EventInput) {
  const emails = [...new Set(input.attendeeEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  return {
    summary: input.title,
    description: input.description || undefined,
    start: { dateTime: input.startAt.toISOString(), timeZone: input.timeZone },
    end: { dateTime: input.endAt.toISOString(), timeZone: input.timeZone },
    attendees: emails.map((email) => ({ email })),
    guestsCanModify: false,
    ...(input.location ? { location: input.location } : {}),
    ...(input.private ? { visibility: "private" } : {}),
    reminders: { useDefault: true },
    ...(input.meet
      ? { conferenceData: { createRequest: { requestId: input.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } }
      : {}),
  };
}

/** What can change on an existing event. Anything left out stays as it is on Google. */
export interface EventChanges {
  title?: string;
  description?: string | null;
  startAt?: Date;
  endAt?: Date;
  timeZone: string;
  /** Everyone the app invites. Missing ones are added; guests who stay keep their reply. */
  attendeeEmails?: string[];
  /** App users taken off. Guests added straight in Google Calendar are never touched. */
  removeEmails?: string[];
  /** Adds a Google Meet link to an event that doesn't have one. */
  addMeet?: { requestId: string };
}

/**
 * The new guest list for an event: everyone already on it stays (with their
 * yes/no/maybe) unless they were taken off, and anyone missing is added.
 */
export function mergeAttendees(existing: { email: string; responseStatus?: string }[] | undefined, add: string[], remove: string[] = []) {
  const norm = (e: string) => e.trim().toLowerCase();
  const wanted = [...new Set(add.map(norm).filter(Boolean))];
  // Someone still invited is never dropped (several people can share one inbox).
  const drop = new Set(remove.map(norm).filter((e) => !wanted.includes(e)));
  const kept = (existing ?? []).filter((a) => !drop.has(norm(a.email)));
  const have = new Set(kept.map((a) => norm(a.email)));
  return [...kept, ...wanted.filter((e) => !have.has(e)).map((email) => ({ email }))];
}

/** A PATCH body for an existing event: only the fields that change. */
export function eventPatch(changes: EventChanges, current?: Pick<GoogleEvent, "attendees">) {
  const guests = changes.attendeeEmails || changes.removeEmails;
  return {
    ...(changes.title !== undefined ? { summary: changes.title } : {}),
    ...(changes.description !== undefined ? { description: changes.description || "" } : {}),
    ...(changes.startAt ? { start: { dateTime: changes.startAt.toISOString(), timeZone: changes.timeZone } } : {}),
    ...(changes.endAt ? { end: { dateTime: changes.endAt.toISOString(), timeZone: changes.timeZone } } : {}),
    ...(guests ? { attendees: mergeAttendees(current?.attendees, changes.attendeeEmails ?? [], changes.removeEmails ?? []) } : {}),
    ...(changes.addMeet
      ? { conferenceData: { createRequest: { requestId: changes.addMeet.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } }
      : {}),
  };
}

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  hangoutLink?: string;
  visibility?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string; responseStatus?: string; self?: boolean }[];
  organizer?: { email?: string; displayName?: string };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}

/** The Meet link of an event, wherever Google put it. */
export function meetLinkOf(event: GoogleEvent) {
  return event.hangoutLink || event.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri || null;
}

/** Start and end as Dates; all-day events run midnight to midnight UTC. */
export function eventTimes(event: GoogleEvent) {
  const start = event.start?.dateTime ?? (event.start?.date ? `${event.start.date}T00:00:00Z` : null);
  const end = event.end?.dateTime ?? (event.end?.date ? `${event.end.date}T00:00:00Z` : null);
  return { start: start ? new Date(start) : null, end: end ? new Date(end) : null, allDay: !event.start?.dateTime };
}

/** Busy blocks that overlap a proposed slot. */
export function clashes(busy: { start: string; end: string }[], startAt: Date, endAt: Date) {
  return busy.filter((b) => new Date(b.start) < endAt && new Date(b.end) > startAt);
}

/** "Add to my Google Calendar" link for a shared calendar. */
export function subscribeUrl(calendarId: string) {
  return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(calendarId)}`;
}

/**
 * Open slots of `minutes` in a working day, given busy blocks. `dayStart` is the
 * asker's local midnight; working hours are counted from it. Slots start on the
 * half hour and never in the past.
 */
export function freeSlots(
  busy: { start: string; end: string }[],
  dayStart: Date,
  minutes: number,
  now = new Date(),
  hours: [number, number] = [9, 19],
) {
  const step = 30 * 60_000;
  const len = minutes * 60_000;
  const open = dayStart.getTime() + hours[0] * 3600_000;
  const close = dayStart.getTime() + hours[1] * 3600_000;
  const slots: string[] = [];
  for (let t = open; t + len <= close; t += step) {
    if (t < now.getTime()) continue;
    if (clashes(busy, new Date(t), new Date(t + len)).length === 0) slots.push(new Date(t).toISOString());
  }
  return slots;
}
