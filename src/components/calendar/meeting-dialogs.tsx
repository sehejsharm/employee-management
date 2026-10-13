"use client";

import * as React from "react";
import { CalendarPlus, Clock, Crown, Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { AssigneePicker, type PickablePerson } from "@/components/tasks/assignee-picker";
import { toLocalInput } from "@/components/tasks/due-picker";
import { founderBusyTimes, meetNow, requestFounderMeeting, scheduleMeeting } from "@/actions/meetings";
import { cn } from "@/lib/utils";

const DURATIONS = [15, 30, 45, 60, 90, 120];

/** The next half hour, as a datetime-local value. */
function nextSlot() {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return toLocalInput(d);
}

/**
 * Opens a tab synchronously (so pop-up blockers allow it), then points it at
 * the Meet link once the server has created the call.
 */
async function startCallInNewTab(start: () => Promise<{ ok: boolean; error?: string; data?: { meetUrl: string | null } }>) {
  const tab = window.open("about:blank", "_blank");
  const res = await start();
  if (!res.ok) {
    tab?.close();
    toast.error(res.error);
    return false;
  }
  const url = res.data?.meetUrl;
  if (url && tab) tab.location.href = url;
  else {
    tab?.close();
    if (url) window.location.href = url;
  }
  toast.success("Call started — they've been notified.");
  return true;
}

/** "Meet now" for one known person (profile pages). */
export function MeetNowButton({
  userId,
  firstName,
  disabled,
  variant = "secondary",
  className,
}: {
  userId: string;
  firstName: string;
  disabled?: boolean;
  variant?: "secondary" | "soft" | "primary";
  className?: string;
}) {
  const [pending, setPending] = React.useState(false);
  return (
    <Button
      variant={variant}
      className={className}
      disabled={disabled}
      loading={pending}
      title={disabled ? "The team calendar isn't connected yet" : `Start a Google Meet call with ${firstName}`}
      onClick={async () => {
        setPending(true);
        await startCallInNewTab(() => meetNow([userId]));
        setPending(false);
      }}
    >
      <Video /> Meet now
    </Button>
  );
}

/** "Meet now" with a choice of people (Calendar page). */
export function MeetNowDialog({ people, selfId, disabled }: { people: PickablePerson[]; selfId: string; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [ids, setIds] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={disabled}>
          <Video /> Meet now
        </Button>
      </DialogTrigger>
      <DialogContent title="Start a call" description="A Google Meet call starts right away; everyone you pick is notified with a link to join.">
        <AssigneePicker
          people={people.filter((p) => p.id !== selfId)}
          value={ids}
          onChange={setIds}
          leadId={null}
          onLeadChange={() => {}}
          selfId={selfId}
          restrictedToSelf={false}
          hideLead
          placeholder="Who do you want to call?"
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            disabled={ids.length === 0}
            loading={pending}
            onClick={async () => {
              setPending(true);
              const ok = await startCallInNewTab(() => meetNow(ids));
              setPending(false);
              if (ok) {
                setOpen(false);
                setIds([]);
              }
            }}
          >
            <Video /> Start call
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Schedule a meeting on the team calendar, with a Meet link and Google invitations. */
export function ScheduleMeetingDialog({
  people,
  selfId,
  disabled,
  initialIds = [],
  trigger,
}: {
  people: PickablePerson[];
  selfId: string;
  disabled?: boolean;
  initialIds?: string[];
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [start, setStart] = React.useState("");
  const [duration, setDuration] = React.useState(30);
  const [ids, setIds] = React.useState<string[]>(initialIds);
  const [meet, setMeet] = React.useState(true);
  const [pending, startTransition] = React.useTransition();

  const save = () =>
    startTransition(async () => {
      if (!start) return void toast.error("Pick when it starts.");
      const res = await scheduleMeeting({ title, description, startAt: new Date(start).toISOString(), durationMin: duration, attendeeIds: ids, meet });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
      setTitle("");
      setDescription("");
      setIds(initialIds);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next && !start) setStart(nextSlot());
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button disabled={disabled}>
            <CalendarPlus /> Schedule meeting
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        size="lg"
        title="Schedule a meeting"
        description="It goes on the team calendar. Google emails everyone an invitation — founders at the calendar they use — with a Meet link."
      >
        <div className="space-y-4">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diwali campaign review" autoFocus maxLength={200} />
          </Field>
          <Field label="Who">
            <AssigneePicker
              people={people.filter((p) => p.id !== selfId)}
              value={ids}
              onChange={setIds}
              leadId={null}
              onLeadChange={() => {}}
              selfId={selfId}
              restrictedToSelf={false}
              hideLead
              placeholder="Invite people"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
            <Field label="Starts">
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Length">
              <NativeSelect value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ` ${m % 60} min` : ""}`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Agenda" optional>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} placeholder="What you'll cover" />
          </Field>
          <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={meet} onChange={(e) => setMeet(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            <Video className="size-4 text-success" /> Add a Google Meet link
          </label>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={save} loading={pending} disabled={!title.trim() || ids.length === 0}>
            <CalendarPlus /> Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface FounderOption {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  /** Their own Google Calendar is connected: busy times can be shown. */
  calendarConnected: boolean;
}

/** Ask a founder for time. Shows when they're busy that day, if their calendar is connected. */
export function RequestFounderDialog({
  founders,
  initialFounderId,
  trigger,
}: {
  founders: FounderOption[];
  initialFounderId?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [founderId, setFounderId] = React.useState(initialFounderId ?? founders[0]?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [start, setStart] = React.useState("");
  const [duration, setDuration] = React.useState(30);
  const [busy, setBusy] = React.useState<{ start: string; end: string }[] | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const founder = founders.find((f) => f.id === founderId);
  const day = start.slice(0, 10);

  React.useEffect(() => {
    if (!open || !founderId || !day) return;
    let live = true;
    const dayStart = new Date(`${day}T00:00`);
    // Runs in a timeout so the loading flag isn't set synchronously inside the effect.
    const t = window.setTimeout(() => {
      setChecking(true);
      founderBusyTimes(founderId, dayStart.toISOString())
        .then((res) => live && setBusy(res.ok ? (res.data?.busy ?? null) : null))
        .finally(() => live && setChecking(false));
    }, 0);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [open, founderId, day]);

  const startAt = start ? new Date(start) : null;
  const endAt = startAt ? new Date(startAt.getTime() + duration * 60_000) : null;
  const clash = !!(busy && startAt && endAt && busy.some((b) => new Date(b.start) < endAt && new Date(b.end) > startAt));
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const send = () =>
    startTransition(async () => {
      if (!startAt) return void toast.error("Suggest a time.");
      const res = await requestFounderMeeting({ founderId, title, description, startAt: startAt.toISOString(), durationMin: duration });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
      setTitle("");
      setDescription("");
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next && !start) setStart(nextSlot());
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="soft" disabled={founders.length === 0}>
            <Crown /> Request time with a founder
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        size="lg"
        title="Request a meeting with a founder"
        description="They accept (or suggest another time) in the Workspace; once accepted it lands on their calendar with a Google Meet link and you're invited."
      >
        <div className="space-y-4">
          <Field label="Founder">
            <NativeSelect value={founderId} onChange={(e) => setFounderId(e.target.value)}>
              {founders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.firstName} {f.lastName}
                  {f.title ? ` — ${f.title}` : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="What's it about">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Feedback on the partnership deck" maxLength={200} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
            <Field label="Suggested time">
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Length">
              <NativeSelect value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.filter((m) => m <= 120).map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ` ${m % 60} min` : ""}`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="rounded-xl border border-line bg-surface-sunken/60 px-3 py-2.5 text-[12.5px] text-fg-muted">
            {checking ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" /> Checking {founder?.firstName}&apos;s calendar…
              </span>
            ) : busy === null ? (
              <span>
                <Clock className="mr-1 inline size-3.5" />
                {founder?.calendarConnected ? "Couldn't read their calendar right now." : `${founder?.firstName ?? "They"} hasn't connected a calendar, so busy times can't be shown.`}
              </span>
            ) : busy.length === 0 ? (
              <span className="text-success">{founder?.firstName} looks free all that day.</span>
            ) : (
              <span>
                <span className={cn("font-medium", clash ? "text-danger" : "text-fg")}>
                  {clash ? `${founder?.firstName} is busy then. ` : `${founder?.firstName} is free then. `}
                </span>
                Busy that day: {busy.map((b) => `${time(b.start)}–${time(b.end)}`).join(", ")}
              </span>
            )}
          </div>
          <Field label="Details" optional>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} placeholder="Context, links, what you need from them" />
          </Field>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={send} loading={pending} disabled={!title.trim() || !founderId}>
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
