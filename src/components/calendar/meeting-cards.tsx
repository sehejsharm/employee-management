"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck2, Check, ExternalLink, Link2, LogOut, Share2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { toLocalInput } from "@/components/tasks/due-picker";
import { cancelMeeting, disconnectGoogle, respondToMeetingRequest, shareTeamCalendar } from "@/actions/meetings";
import { formatDate, formatTime } from "@/lib/time";
import { useNow } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export interface MeetingPerson {
  id: string;
  firstName: string;
  lastName: string;
  avatarHue: number;
  title: string | null;
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
  canCancel: boolean;
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
export function MeetingCard({ meeting, tz, selfId }: { meeting: ClientMeeting; tz: string; selfId: string }) {
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
          <h3 className="mt-1 text-[15px] font-semibold leading-snug">{meeting.title}</h3>
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
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
          {meeting.meetUrl && (
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
          <h3 className="mt-0.5 text-[15px] font-semibold leading-snug">{meeting.title}</h3>
          <p className="mt-0.5 text-[13px] text-fg-muted" suppressHydrationWarning>
            Suggested: {when(meeting, tz)} ({minutes} min)
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
export function GoogleConnections({
  configured,
  personal,
  team,
  subscribeUrl,
}: {
  configured: boolean;
  personal: { email: string; broken: boolean } | null;
  team: { email: string; calendarName: string | null; broken: boolean } | null;
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
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-line p-3.5">
        <div className="text-[13px] font-semibold">Your calendar</div>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">
          People request time with you here; accepted meetings land on it and your busy times guide their requests.
        </p>
        {personal ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", personal.broken ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>
              {personal.broken ? "Needs reconnecting" : "Connected"}
            </span>
            <span className="truncate text-fg-muted">{personal.email}</span>
          </div>
        ) : null}
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
