"use client";

import * as React from "react";
import { CalendarPlus, Clock, Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { AssigneePicker, type PickablePerson } from "@/components/tasks/assignee-picker";
import { toLocalInput } from "@/components/tasks/due-picker";
import { askFounderAvailability, founderAvailability, meetNow, requestFounderMeeting, scheduleMeeting, type AvailabilityAccess } from "@/actions/meetings";
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
  const [isPrivate, setIsPrivate] = React.useState(true);
  const [pending, startTransition] = React.useTransition();

  const save = () =>
    startTransition(async () => {
      if (!start) return void toast.error("Pick when it starts.");
      const res = await scheduleMeeting({ title, description, startAt: new Date(start).toISOString(), durationMin: duration, attendeeIds: ids, meet, private: isPrivate });
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
          <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
            <span>
              Only people invited can see it
              <span className="block text-[12px] text-fg-subtle">
                On the shared team calendar everyone else just sees &quot;busy&quot;. Untick for team-wide meetings everyone should see.
              </span>
            </span>
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
  /** Their own Google Calendar is connected. */
  calendarConnected: boolean;
}

/** Ask a founder for time. Their free slots show only once they have agreed to share them. */
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
  const [availability, setAvailability] = React.useState<AvailabilityAccess | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [asking, setAsking] = React.useState(false);
  const [ask, setAsk] = React.useState({ purpose: "", meetings: 1, slotMinutes: 30 as 15 | 30 | 45 | 60 | 90 });
  const [reload, setReload] = React.useState(0);
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
      founderAvailability(founderId, dayStart.toISOString(), duration)
        .then((res) => live && setAvailability(res.ok ? res.data! : null))
        .finally(() => live && setChecking(false));
    }, 0);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [open, founderId, day, duration, reload]);

  const startAt = start ? new Date(start) : null;
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const pickSlot = (iso: string) => setStart(toLocalInput(new Date(iso)));

  const sendAsk = () =>
    startTransition(async () => {
      const res = await askFounderAvailability({ founderId, ...ask });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setAsking(false);
      setReload((n) => n + 1);
    });

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
            Request time with a founder
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
            {checking || !availability ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" /> Checking…
              </span>
            ) : availability.access === "granted" ? (
              <div>
                <div className="mb-1.5 font-medium text-fg">
                  {founder?.firstName}&apos;s open {duration}-minute slots that day — tap one:
                </div>
                {availability.slots.length === 0 ? (
                  <span>None that day. Try another date.</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {availability.slots.map((iso) => {
                      const on = startAt?.getTime() === new Date(iso).getTime();
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => pickSlot(iso)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[12px] font-medium tabular transition",
                            on ? "border-brand bg-brand text-white" : "border-line bg-surface text-fg hover:border-brand/40 hover:text-brand",
                          )}
                        >
                          {time(iso)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : availability.access === "pending" ? (
              <span>
                <Clock className="mr-1 inline size-3.5" />
                You&apos;ve asked to see when {founder?.firstName} is free — waiting for an answer. You can still suggest a time.
              </span>
            ) : availability.access === "unavailable" ? (
              <span>{founder?.firstName}&apos;s calendar isn&apos;t connected right now — suggest a time and they&apos;ll confirm.</span>
            ) : asking ? (
              <div className="space-y-2">
                <div className="font-medium text-fg">Ask {founder?.firstName} to see when they&apos;re free</div>
                <Input
                  value={ask.purpose}
                  onChange={(e) => setAsk((a) => ({ ...a, purpose: e.target.value }))}
                  placeholder="What the meetings are for"
                  maxLength={1000}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={ask.meetings}
                    onChange={(e) => setAsk((a) => ({ ...a, meetings: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))}
                    className="w-20"
                    aria-label="How many meetings"
                  />
                  <span>meeting(s) of</span>
                  <NativeSelect
                    value={ask.slotMinutes}
                    onChange={(e) => setAsk((a) => ({ ...a, slotMinutes: Number(e.target.value) as 15 | 30 | 45 | 60 | 90 }))}
                    className="w-28"
                    aria-label="Meeting length"
                  >
                    {[15, 30, 45, 60, 90].map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </NativeSelect>
                  <Button size="sm" onClick={sendAsk} loading={pending} disabled={ask.purpose.trim().length < 5}>
                    Ask
                  </Button>
                </div>
              </div>
            ) : (
              <span>
                {availability.access === "declined" ? `${founder?.firstName} didn't share their availability last time. ` : `${founder?.firstName}'s calendar is private. `}
                <button type="button" onClick={() => setAsking(true)} className="font-medium text-brand hover:underline">
                  Ask to see when they&apos;re free
                </button>{" "}
                — or just suggest a time below.
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
