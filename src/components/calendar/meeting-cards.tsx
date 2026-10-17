"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck2, Check, Copy, ExternalLink, Link2, LogOut, Share2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { toLocalInput } from "@/components/tasks/due-picker";
import { answerAvailabilityRequest, cancelMeeting, disconnectGoogle, respondToMeetingRequest, shareTeamCalendar } from "@/actions/meetings";
import { formatDate, formatTime } from "@/lib/time";
import { useNow } from "@/lib/hooks";
import { notesBlock } from "@/lib/meeting-notes";
import { MeetingNotesCallout } from "@/components/calendar/meeting-notes";
import { EditMeetingDialog } from "@/components/calendar/meeting-dialogs";
import type { PickablePerson } from "@/components/tasks/assignee-picker";
import { cn } from "@/lib/utils";

export interface MeetingPerson {
  id: string;
  firstName: string;
  lastName: string;
  avatarHue: number;
  title: string | null;
  role?: string;
  /** Founders' "Before you meet me" notes. */
  meetingNotes?: string | null;
}

export interface ClientMeeting {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  status: "REQUESTED" | "SCHEDULED" | "DECLINED" | "CANCELLED";
  instant: boolean;
  meetUrl: string | null;
  htmlLink: string | null;
  responseNote: string | null;
  organizer: MeetingPerson;
  host: MeetingPerson | null;
  attendees: MeetingPerson[];
  /** Multi-slot blocks: one call per slot, each with its own Meet link. */
  slots: { id: string; position: number; startAt: string; endAt: string; guestName: string | null; meetUrl: string | null }[];
  canCancel: boolean;
  /** Can change the time, title, agenda or who's invited. */
  canEdit: boolean;
  /** Version of the meeting as loaded, so an edit can't overwrite a newer one. */
  updatedAt: string;
}

/**
 * A polished invite to paste into an email or WhatsApp for someone outside the
 * company: who they're meeting, when (with the time zone), and how to join.
 */
/** Everyone in a meeting, host first, without repeats. */
function meetingPeople(m: Pick<ClientMeeting, "organizer" | "host" | "attendees">) {
  return [m.host, m.organizer, ...m.attendees].filter((p, i, all): p is MeetingPerson => !!p && all.findIndex((x) => x?.id === p.id) === i);
}

/** Founders in a meeting who have "Before you meet me" notes. */
function foundersWithNotes(people: MeetingPerson[]) {
  return people.filter((p) => p.role === "FOUNDER" && p.meetingNotes?.trim());
}

export function guestInvite(
  m: Pick<ClientMeeting, "title" | "description" | "organizer" | "host" | "attendees">,
  call: { startAt: string; endAt: string; meetUrl: string; guestName?: string | null },
  tz: string,
) {
  const s = new Date(call.startAt);
  const e = new Date(call.endAt);
  const minutes = Math.round((e.getTime() - s.getTime()) / 60_000);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(s);
  const t = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "long" }).formatToParts(s).find((p) => p.type === "timeZoneName")?.value ?? tz;
  const name = (p: MeetingPerson) => `${p.firstName} ${p.lastName}${p.title ? ` (${p.title})` : ""}`;
  const team = meetingPeople(m);
  const notes = foundersWithNotes(team).map((f) => notesBlock(f.firstName, f.meetingNotes)!);
  return [
    `Dear ${call.guestName?.trim() || "Guest"},`,
    "",
    `Thank you for your time. You are invited to a ${minutes}-minute video call with Focus Realm.`,
    "",
    `Topic: ${m.title}`,
    `Date: ${date}`,
    `Time: ${t(s)} – ${t(e)} (${zone})`,
    `With: ${team.slice(0, 6).map(name).join(", ")}${team.length > 6 ? ` and ${team.length - 6} more` : ""}`,
    "",
    `Join with Google Meet: ${call.meetUrl}`,
    "",
    "How to join:",
    "• Open the link above a couple of minutes before the start — on a laptop (Chrome works best) or the Google Meet app on your phone.",
    "• No invitation or Google account is needed — just open the link and join. (If you see “Ask to join”, click it and we'll let you in.)",
    "• Please check your camera and microphone beforehand and join from a quiet place.",
    ...notes.flatMap((n) => ["", n]),
    // The meeting's own description is written for colleagues (often notes for the founder),
    // so it never goes into an invite for someone outside the company.
    "",
    "If you need to reschedule, simply reply to this message.",
    "",
    "We look forward to speaking with you.",
    "",
    "Warm regards,",
    `${m.organizer.firstName} ${m.organizer.lastName}`,
    "Focus Realm",
  ].join("\n");
}

function CopyInvite({ text, label = "Copy guest invite" }: { text: string; label?: string }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("Invite copied — paste it into an email or WhatsApp.");
        } catch {
          window.prompt("Copy the invite:", text);
        }
      }}
    >
      <Copy /> {label}
    </Button>
  );
}

function when(m: { startAt: string; endAt: string }, tz: string) {
  const s = new Date(m.startAt);
  return `${formatDate(s, tz, { weekday: true })} · ${formatTime(s, tz)}–${formatTime(new Date(m.endAt), tz)}`;
}

function useAction() {
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else if (res.message) toast.success(res.message);
    });
  return [pending, run] as const;
}

/** A scheduled meeting: when, who, and a big Join button when it's close. */
export function MeetingCard({ meeting, tz, selfId, people: everyone = [] }: { meeting: ClientMeeting; tz: string; selfId: string; people?: PickablePerson[] }) {
  const [pending, run] = useAction();
  // Null until hydrated, so server and client render the same; then ticks every 30s.
  const now = useNow(30_000)?.getTime();
  const live = !!now && new Date(meeting.startAt).getTime() - 10 * 60_000 <= now && new Date(meeting.endAt).getTime() >= now;
  const people = [meeting.organizer, ...(meeting.host && meeting.host.id !== meeting.organizer.id ? [meeting.host] : []), ...meeting.attendees].filter(
    (p, i, all) => all.findIndex((x) => x.id === p.id) === i,
  );
  const others = people.filter((p) => p.id !== selfId);

  return (
    <li className={cn("rounded-2xl border bg-surface p-4 shadow-sm", live ? "border-success/40 ring-2 ring-success/15" : "border-line")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {live && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> {meeting.instant ? "Call in progress" : "Happening now"}
              </span>
            )}
            {meeting.host && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-soft-fg">With a founder</span>}
          </div>
          <h3 className="mt-1 text-[15px] font-semibold leading-snug wrap-anywhere">{meeting.title}</h3>
          <p className="mt-0.5 text-[13px] text-fg-muted" suppressHydrationWarning>
            {when(meeting, tz)}
          </p>
          <div className="mt-2.5 flex items-center gap-2 text-[12.5px] text-fg-muted">
            <AvatarStack people={people} max={5} />
            <span className="truncate">
              {others.length ? `With ${others.map((p) => p.firstName).join(", ")}` : "Just you"}
              {meeting.organizer.id !== selfId && ` · arranged by ${meeting.organizer.firstName}`}
            </span>
          </div>
          {meeting.description && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[12.5px] text-fg-subtle">{meeting.description}</p>}
          {foundersWithNotes(others).map((f) => (
            <MeetingNotesCallout key={f.id} firstName={f.firstName} notes={f.meetingNotes} className="mt-3" />
          ))}
          {meeting.slots.length > 1 && (
            <ol className="mt-3 divide-y divide-line rounded-xl border border-line">
              {meeting.slots.map((slot) => {
                const slotLive = !!now && new Date(slot.startAt).getTime() - 5 * 60_000 <= now && new Date(slot.endAt).getTime() >= now;
                return (
                  <li key={slot.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium">
                        Slot {slot.position}
                        {slot.guestName ? ` — ${slot.guestName}` : ""}
                      </div>
                      <div className="text-[12px] text-fg-muted" suppressHydrationWarning>
                        {formatTime(new Date(slot.startAt), tz)}–{formatTime(new Date(slot.endAt), tz)}
                      </div>
                    </div>
                    {slot.meetUrl && (
                      <div className="flex flex-wrap gap-2">
                        <CopyInvite text={guestInvite(meeting, { ...slot, meetUrl: slot.meetUrl }, tz)} label="Copy invite" />
                        <Button asChild variant={slotLive ? "primary" : "soft"} size="sm">
                          <a href={slot.meetUrl} target="_blank" rel="noopener noreferrer">
                            <Video /> {slotLive ? "Join now" : "Meet link"}
                          </a>
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
          {meeting.meetUrl && meeting.slots.length <= 1 && !meeting.instant && (
            <CopyInvite text={guestInvite(meeting, { startAt: meeting.startAt, endAt: meeting.endAt, meetUrl: meeting.meetUrl }, tz)} />
          )}
          {meeting.meetUrl && meeting.slots.length <= 1 && (
            <Button asChild variant={live ? "primary" : "soft"} size="sm">
              <a href={meeting.meetUrl} target="_blank" rel="noopener noreferrer">
                <Video /> {live ? "Join now" : "Meet link"}
              </a>
            </Button>
          )}
          {meeting.htmlLink && (
            <Button asChild variant="secondary" size="sm">
              <a href={meeting.htmlLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Google Calendar
              </a>
            </Button>
          )}
          {meeting.canEdit && <EditMeetingDialog meeting={meeting} people={everyone} selfId={selfId} />}
          {meeting.canCancel && (
            <Button
              variant="ghost"
              size="sm"
              loading={pending}
              onClick={() => {
                if (window.confirm(`Cancel "${meeting.title}"? Everyone invited is told.`)) run(() => cancelMeeting(meeting.id));
              }}
            >
              <X /> Cancel
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** A request waiting on this founder: accept as asked, at another time, or decline. */
export function RequestToAnswer({ meeting, tz }: { meeting: ClientMeeting; tz: string }) {
  const [pending, run] = useAction();
  const [time, setTime] = React.useState("");
  const [note, setNote] = React.useState("");
  const [declining, setDeclining] = React.useState(false);
  const minutes = Math.round((new Date(meeting.endAt).getTime() - new Date(meeting.startAt).getTime()) / 60_000);

  return (
    <li id={`request-${meeting.id}`} className="scroll-mt-24 rounded-2xl border border-info/25 bg-info-soft/40 p-4">
      <div className="flex items-start gap-3">
        <Avatar person={meeting.organizer} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px]">
            <span className="font-semibold">
              {meeting.organizer.firstName} {meeting.organizer.lastName}
            </span>{" "}
            asked to meet
          </p>
          <h3 className="mt-0.5 text-[15px] font-semibold leading-snug wrap-anywhere">{meeting.title}</h3>
          <p className="mt-0.5 text-[13px] text-fg-muted" suppressHydrationWarning>
            Suggested: {when(meeting, tz)} ({meeting.slots.length > 1 ? `${meeting.slots.length} slots × ${minutes / meeting.slots.length} min, each its own Meet link` : `${minutes} min`})
          </p>
          {meeting.description && <p className="mt-2 whitespace-pre-wrap text-[12.5px] text-fg-muted">{meeting.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" loading={pending} onClick={() => run(() => respondToMeetingRequest(meeting.id, { accept: true }))}>
              <Check /> Accept
            </Button>
            <Dialog onOpenChange={(open) => open && !time && setTime(toLocalInput(new Date(meeting.startAt)))}>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary">
                  <CalendarCheck2 /> Another time
                </Button>
              </DialogTrigger>
              <DialogContent size="sm" title="Accept at another time" description={`${meeting.organizer.firstName} is told the new time and invited.`}>
                <Field label="New time">
                  <Input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
                </Field>
                <Field label="Note" optional className="mt-3">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Mornings are better" />
                </Field>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <Button
                    loading={pending}
                    disabled={!time}
                    onClick={() => run(() => respondToMeetingRequest(meeting.id, { accept: true, startAt: new Date(time).toISOString(), note }))}
                  >
                    Accept at this time
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button size="sm" variant="ghost" onClick={() => setDeclining((d) => !d)}>
              <X /> Decline
            </Button>
          </div>
          {declining && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Optional — why, or what to do instead" className="flex-1" />
              <Button variant="danger" size="sm" loading={pending} onClick={() => run(() => respondToMeetingRequest(meeting.id, { accept: false, note }))}>
                Decline
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** One of your own requests to a founder. */
export function MyRequest({ meeting, tz }: { meeting: ClientMeeting; tz: string }) {
  const [pending, run] = useAction();
  const declined = meeting.status === "DECLINED";
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">{meeting.title}</div>
        <div className="text-[12.5px] text-fg-muted" suppressHydrationWarning>
          {meeting.host?.firstName} · {when(meeting, tz)}
        </div>
        {declined && meeting.responseNote && <div className="mt-1 text-[12.5px] text-fg-subtle">“{meeting.responseNote}”</div>}
      </div>
      {declined ? (
        <span className="self-start rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger sm:self-center">Declined</span>
      ) : (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">Waiting</span>
          <Button size="xs" variant="ghost" loading={pending} onClick={() => run(() => cancelMeeting(meeting.id))}>
            Withdraw
          </Button>
        </div>
      )}
    </li>
  );
}

/** Founders: the two Google connections and what they do. */
type MeetAccess = { openLinks: boolean; meetError: string | null };

/** Whether Meet links made through this calendar let anyone with the link straight in. */
function OpenLinksNote({ access }: { access: MeetAccess }) {
  if (!access.openLinks) {
    return (
      <p className="mt-2 rounded-lg bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning">
        Reconnect to make Meet links open to anyone with the link — so guests join without an invitation or the invited Google account.
      </p>
    );
  }
  if (access.meetError) {
    return (
      <p className="mt-2 rounded-lg bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning">
        The last Meet link couldn&apos;t be made open: {access.meetError.replace(/[.\s]*$/, ".")} Check that the Google Meet REST API is turned on (see docs/GOOGLE_CALENDAR.md).
      </p>
    );
  }
  return <p className="mt-2 text-[12px] text-fg-subtle">Meet links are open: anyone with the link can join, no invitation needed.</p>;
}

export function GoogleConnections({
  configured,
  personal,
  team,
  subscribeUrl,
}: {
  configured: boolean;
  personal: ({ email: string; broken: boolean } & MeetAccess) | null;
  team: ({ email: string; calendarName: string | null; broken: boolean } & MeetAccess) | null;
  subscribeUrl: string | null;
}) {
  const [pending, run] = useAction();
  if (!configured) {
    return (
      <p className="text-[13px] text-fg-muted">
        Google Calendar isn&apos;t set up for this deployment yet. Add <code className="rounded bg-surface-sunken px-1">GOOGLE_CLIENT_ID</code> and{" "}
        <code className="rounded bg-surface-sunken px-1">GOOGLE_CLIENT_SECRET</code> (see <span className="font-medium">docs/GOOGLE_CALENDAR.md</span>), redeploy, then connect here.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-line p-3.5">
        <div className="text-[13px] font-semibold">Your calendar</div>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">
          People request time with you here and accepted meetings land on it. Your free time stays private — people only see open slots after you approve their request.
        </p>
        {personal ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", personal.broken ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>
              {personal.broken ? "Needs reconnecting" : "Connected"}
            </span>
            <span className="truncate text-fg-muted">{personal.email}</span>
          </div>
        ) : null}
        {personal && !personal.broken && <OpenLinksNote access={personal} />}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant={personal && !personal.broken ? "secondary" : "primary"}>
            <a href="/api/google/connect?kind=personal">
              <Link2 /> {personal ? "Reconnect" : "Connect Google Calendar"}
            </a>
          </Button>
          {personal && (
            <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => disconnectGoogle("personal"))}>
              <LogOut /> Disconnect
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-line p-3.5">
        <div className="text-[13px] font-semibold">Team calendar</div>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">
          One shared calendar for everyone&apos;s work meetings and calls. Connect it with the Google account that should own it.
        </p>
        {team ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", team.broken ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>
              {team.broken ? "Needs reconnecting" : "Connected"}
            </span>
            <span className="truncate text-fg-muted">
              {team.calendarName} · {team.email}
            </span>
          </div>
        ) : null}
        {team && !team.broken && <OpenLinksNote access={team} />}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant={team && !team.broken ? "secondary" : "primary"}>
            <a href="/api/google/connect?kind=team">
              <Link2 /> {team ? "Reconnect" : "Connect team calendar"}
            </a>
          </Button>
          {team && !team.broken && (
            <Button size="sm" variant="soft" loading={pending} onClick={() => run(shareTeamCalendar)}>
              <Share2 /> Share with everyone
            </Button>
          )}
          {team && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (window.confirm("Disconnect the team calendar? Scheduling and calls stop until it's connected again.")) run(() => disconnectGoogle("team"));
              }}
            >
              <LogOut /> Disconnect
            </Button>
          )}
        </div>
        {subscribeUrl && (
          <Link href={subscribeUrl} target="_blank" className="mt-2 inline-block text-[12px] font-medium text-brand hover:underline">
            Add it to your Google Calendar →
          </Link>
        )}
      </div>
    </div>
  );
}

/** Someone asking this founder to see when they're free. */
export function AvailabilityAsk({
  ask,
}: {
  ask: { id: string; purpose: string; meetings: number; slotMinutes: number; requester: MeetingPerson };
}) {
  const [pending, run] = useAction();
  return (
    <li className="rounded-2xl border border-info/25 bg-info-soft/40 p-4">
      <div className="flex items-start gap-3">
        <Avatar person={ask.requester} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px]">
            <span className="font-semibold">
              {ask.requester.firstName} {ask.requester.lastName}
            </span>{" "}
            is asking to see when you&apos;re free — {ask.meetings} meeting{ask.meetings === 1 ? "" : "s"} of {ask.slotMinutes} min
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg-muted">“{ask.purpose}”</p>
          <p className="mt-1 text-[12px] text-fg-subtle">They&apos;d see open slots only (never what your events are), for 14 days.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" loading={pending} onClick={() => run(() => answerAvailabilityRequest(ask.id, { approve: true }))}>
              <Check /> Share my free time
            </Button>
            <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => answerAvailabilityRequest(ask.id, { approve: false }))}>
              <X /> Decline
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
