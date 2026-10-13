import type { Metadata } from "next";
import { CalendarDays, Inbox, Video } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AvailabilityAsk, GoogleConnections, MeetingCard, MyRequest, RequestToAnswer, type ClientMeeting } from "@/components/calendar/meeting-cards";
import { MeetNowDialog, RequestFounderDialog, ScheduleMeetingDialog } from "@/components/calendar/meeting-dialogs";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { googleConfig } from "@/lib/google/config";
import { listEvents, personalConnection, teamConnection } from "@/lib/google/calendar";
import { eventTimes, meetLinkOf, subscribeUrl, type GoogleEvent } from "@/lib/google/events";
import { canCancelMeeting, meetingsFor, type MeetingRow } from "@/lib/meetings";
import { pickablePeople } from "@/lib/people";
import { isFounder } from "@/lib/permissions";
import { dayKey, formatDate, formatTime } from "@/lib/time";
import { getTimeZone } from "@/lib/tz.server";

export const metadata: Metadata = { title: "Calendar" };

const GOOGLE_NOTICE: Record<string, { tone: "success" | "danger"; text: string }> = {
  "personal-connected": { tone: "success", text: "Your Google Calendar is connected. People can now request time with you." },
  "team-connected": { tone: "success", text: "The team calendar is connected. Everyone can schedule meetings and start calls." },
  cancelled: { tone: "danger", text: "Google sign-in was cancelled." },
  expired: { tone: "danger", text: "That sign-in took too long or came from another browser. Try connecting again." },
  "founders-only": { tone: "danger", text: "Only founders can connect Google accounts." },
  "not-configured": { tone: "danger", text: "Google Calendar isn't set up for this deployment yet." },
  failed: { tone: "danger", text: "Google didn't accept the connection." },
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ google?: string; reason?: string }> }) {
  const user = await requireUser();
  const tz = await getTimeZone();
  const params = await searchParams;
  const founder = isFounder(user);
  const configured = googleConfig.configured();

  const [team, personal, mine, people, founders, availabilityAsks] = await Promise.all([
    teamConnection(),
    founder ? personalConnection(user.id) : null,
    meetingsFor(user.id),
    pickablePeople(),
    db.user.findMany({
      where: { role: "FOUNDER", status: { not: "INACTIVE" }, id: { not: user.id } },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, title: true, meetingNotes: true, googleConnection: { select: { lastError: true } } },
    }),
    founder
      ? db.availabilityRequest.findMany({
          where: { founderId: user.id, status: "PENDING" },
          orderBy: { createdAt: "asc" },
          select: { id: true, purpose: true, meetings: true, slotMinutes: true, requester: { select: { id: true, firstName: true, lastName: true, avatarHue: true, title: true } } },
        })
      : [],
  ]);
  const teamReady = configured && !!team && !team.lastError;

  // The team calendar as Google has it — including anything added there directly.
  let agenda: GoogleEvent[] | null = null;
  if (teamReady) {
    const now = new Date();
    agenda = await listEvents(team, now, new Date(now.getTime() + 14 * 24 * 3600_000)).catch(() => null);
  }
  // Private meetings on the shared calendar show only to the people in them.
  if (agenda?.some((e) => e.visibility === "private")) {
    const mineIds = new Set(
      (
        await db.meeting.findMany({
          where: {
            OR: [{ googleEventId: { in: agenda.map((e) => e.id) } }, { teamEventId: { in: agenda.map((e) => e.id) } }],
            AND: [{ OR: [{ organizerId: user.id }, { hostId: user.id }, { attendees: { some: { userId: user.id } } }] }],
          },
          select: { googleEventId: true, teamEventId: true },
        })
      ).flatMap((m) => [m.googleEventId, m.teamEventId]),
    );
    agenda = agenda.filter((e) => e.visibility !== "private" || mineIds.has(e.id));
  }
  const agendaByDay = new Map<string, GoogleEvent[]>();
  for (const e of agenda ?? []) {
    const { start } = eventTimes(e);
    if (!start) continue;
    const key = dayKey(start, tz);
    agendaByDay.set(key, [...(agendaByDay.get(key) ?? []), e]);
  }

  const toClient = (m: MeetingRow): ClientMeeting => ({
    id: m.id,
    title: m.title,
    description: m.description,
    startAt: m.startAt.toISOString(),
    endAt: m.endAt.toISOString(),
    status: m.status,
    instant: m.instant,
    meetUrl: m.meetUrl,
    htmlLink: m.htmlLink,
    responseNote: m.responseNote,
    organizer: m.organizer,
    host: m.host,
    attendees: m.attendees.map((a) => a.user),
    slots: m.slots.map((sl) => ({ ...sl, startAt: sl.startAt.toISOString(), endAt: sl.endAt.toISOString() })),
    canCancel: canCancelMeeting(user, { organizerId: m.organizer.id, hostId: m.host?.id ?? null }),
  });
  const notice = params.google ? GOOGLE_NOTICE[params.google] : null;
  const founderOptions = founders.map((f) => ({
    id: f.id,
    firstName: f.firstName,
    lastName: f.lastName,
    title: f.title,
    calendarConnected: !!f.googleConnection && !f.googleConnection.lastError,
    meetingNotes: f.meetingNotes,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Work"
        title="Calendar & meetings"
        description="Meet anyone on Google Meet, schedule on the shared team calendar, and ask the founders for time."
        actions={
          <>
            <MeetNowDialog people={people} selfId={user.id} disabled={!teamReady} />
            {founderOptions.length > 0 && <RequestFounderDialog founders={founderOptions} />}
            <ScheduleMeetingDialog people={people} selfId={user.id} disabled={!teamReady} />
          </>
        }
      />

      {notice && (
        <div
          role="status"
          className={`mb-6 rounded-xl border px-4 py-3 text-[13.5px] ${notice.tone === "success" ? "border-success/25 bg-success-soft text-success" : "border-danger/25 bg-danger-soft text-danger"}`}
        >
          {notice.text}
          {params.reason && <span className="mt-0.5 block text-[12.5px] opacity-80">{params.reason}</span>}
        </div>
      )}

      {!teamReady && !founder && (
        <div className="mb-6 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3 text-[13.5px] text-warning">
          {team?.lastError
            ? "The team calendar's Google connection has expired. A founder needs to reconnect it before meetings and calls work again."
            : "The team calendar isn't connected yet. A founder connects it once on this page — then scheduling and calls work for everyone. You can still request time with a founder."}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {founder && (
            <Card>
              <CardHeader icon={<CalendarDays />} title="Google Calendar" description="Founders connect calendars here. Tokens are encrypted and never leave the server." />
              <CardBody>
                <GoogleConnections
                  configured={configured}
                  personal={personal ? { email: personal.googleEmail, broken: !!personal.lastError } : null}
                  team={team ? { email: team.googleEmail, calendarName: team.calendarName, broken: !!team.lastError } : null}
                  subscribeUrl={team && team.calendarId !== "primary" ? subscribeUrl(team.calendarId) : null}
                />
              </CardBody>
            </Card>
          )}

          {availabilityAsks.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                <Inbox className="size-4 text-info" /> Asking to see your free time · {availabilityAsks.length}
              </h2>
              <ul className="space-y-3">
                {availabilityAsks.map((a) => (
                  <AvailabilityAsk key={a.id} ask={a} />
                ))}
              </ul>
            </section>
          )}

          {mine.toAnswer.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                <Inbox className="size-4 text-info" /> Waiting for your answer · {mine.toAnswer.length}
              </h2>
              <ul className="space-y-3">
                {mine.toAnswer.map((m) => (
                  <RequestToAnswer key={m.id} meeting={toClient(m)} tz={tz} />
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
              <Video className="size-4 text-success" /> Your upcoming meetings
            </h2>
            {mine.upcoming.length === 0 ? (
              <Card>
                <EmptyState icon={<Video />} title="Nothing scheduled" description="Start a call, schedule a meeting, or ask a founder for time." compact />
              </Card>
            ) : (
              <ul className="space-y-3">
                {mine.upcoming.map((m) => (
                  <MeetingCard key={m.id} meeting={toClient(m)} tz={tz} selfId={user.id} />
                ))}
              </ul>
            )}
          </section>

          {mine.mine.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                Your requests to founders
              </h2>
              <ul className="space-y-2">
                {mine.mine.map((m) => (
                  <MyRequest key={m.id} meeting={toClient(m)} tz={tz} />
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader icon={<CalendarDays />} title="Team calendar" description={teamReady ? "The next two weeks, straight from Google." : "Not connected yet."} />
            <CardBody className="pt-3">
              {!teamReady ? (
                <p className="text-[13px] text-fg-subtle">Once a founder connects it, everything on the shared calendar shows here.</p>
              ) : agenda === null ? (
                <p className="text-[13px] text-fg-subtle">Couldn&apos;t reach Google Calendar just now.</p>
              ) : agenda.length === 0 ? (
                <p className="text-[13px] text-fg-subtle">Nothing on the team calendar in the next two weeks.</p>
              ) : (
                <div className="space-y-4">
                  {[...agendaByDay.entries()].map(([day, events]) => (
                    <div key={day}>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                        {formatDate(eventTimes(events[0]).start!, tz, { weekday: true })}
                      </div>
                      <ul className="space-y-1.5">
                        {events.map((e) => {
                          const t = eventTimes(e);
                          const link = meetLinkOf(e);
                          return (
                            <li key={e.id} className="flex items-start gap-2.5 rounded-lg px-1.5 py-1 text-[13px] hover:bg-surface-hover">
                              <span className="w-16 shrink-0 pt-px text-[12px] tabular text-fg-muted">{t.allDay ? "All day" : formatTime(t.start!, tz)}</span>
                              <a href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium hover:text-brand">
                                {e.summary || "(No title)"}
                              </a>
                              {link && (
                                <a href={link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-success" aria-label="Join on Google Meet">
                                  <Video className="size-4" />
                                </a>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
