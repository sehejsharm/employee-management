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
    reminders: { useDefault: true },
    ...(input.meet
      ? { conferenceData: { createRequest: { requestId: input.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } }
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
