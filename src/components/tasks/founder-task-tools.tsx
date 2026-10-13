"use client";

import * as React from "react";
import { CalendarPlus, Combine, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { extendDeadline, mergeTasks } from "@/actions/tasks";
import { toLocalInput } from "./due-picker";
import { cn } from "@/lib/utils";

const DAY = 24 * 3600_000;

/** Founders: give more time, with a reason the team can see. */
export function ExtendDeadlineDialog({ taskId, taskRef, dueAt, className }: { taskId: string; taskRef: string; dueAt: string; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, start] = React.useTransition();
  const current = new Date(dueAt);
  // Presets count from the later of the current deadline and now, so an overdue task gets real time.
  const from = () => new Date(Math.max(current.getTime(), Date.now()));
  const presets = [
    { label: "+1 day", ms: DAY },
    { label: "+3 days", ms: 3 * DAY },
    { label: "+1 week", ms: 7 * DAY },
  ];

  const save = () =>
    start(async () => {
      const res = await extendDeadline(taskId, { dueAt: new Date(value).toISOString(), reason });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
      setReason("");
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(toLocalInput(new Date(from().getTime() + DAY)));
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="soft" className={className}>
          <CalendarPlus /> Extend deadline
        </Button>
      </DialogTrigger>
      <DialogContent size="sm" title={`Extend ${taskRef}`} description="Everyone on the task is told, and reminders restart for the new deadline.">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setValue(toLocalInput(new Date(from().getTime() + p.ms)))}
              className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-fg-muted transition hover:border-brand/40 hover:text-brand"
            >
              {p.label}
            </button>
          ))}
        </div>
        <Field label="New deadline">
          <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Reason" optional className="mt-3">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Waiting on the client's assets" />
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={save} loading={pending} disabled={!value}>
            Extend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface MergeCandidate {
  id: string;
  ref: string;
  title: string;
  people: string;
  departments: string;
  due: string;
}

/** Founders: fold other tasks — from one team or several — into this one. */
export function MergeTasksDialog({ taskId, taskRef, candidates, className }: { taskId: string; taskRef: string; candidates: MergeCandidate[]; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [latest, setLatest] = React.useState(false);
  const [pending, start] = React.useTransition();
  const q = query.trim().toLowerCase();
  const list = candidates.filter((c) => !q || `${c.ref} ${c.title} ${c.people} ${c.departments}`.toLowerCase().includes(q));

  const save = () =>
    start(async () => {
      const res = await mergeTasks(taskId, { sourceIds: picked, latestDeadline: latest });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
      setPicked([]);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className={className}>
          <Combine /> Merge tasks
        </Button>
      </DialogTrigger>
      <DialogContent
        size="lg"
        title={`Merge into ${taskRef}`}
        description="Everyone on the picked tasks joins this one; their checklists, documents, submissions and history move here, and the old tasks close."
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by ID, title, person or team" className="pl-9" autoFocus />
        </div>
        <ul className="mt-3 max-h-[45dvh] space-y-1.5 overflow-y-auto">
          {list.length === 0 && <li className="py-6 text-center text-[13px] text-fg-muted">No open tasks match.</li>}
          {list.map((c) => {
            const on = picked.includes(c.id);
            return (
              <li key={c.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition",
                    on ? "border-brand/40 bg-brand-soft/50" : "border-line hover:border-line-strong",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                    className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">
                      <span className="mr-1.5 font-mono text-[11.5px] text-fg-subtle">{c.ref}</span>
                      {c.title}
                    </span>
                    <span className="block truncate text-[12px] text-fg-muted">
                      {c.people || "No one yet"}
                      {c.departments && ` · ${c.departments}`} · due {c.due}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[13px] text-fg-muted">
          <input type="checkbox" checked={latest} onChange={(e) => setLatest(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Use the latest deadline of all the merged tasks
        </label>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button onClick={save} loading={pending} disabled={picked.length === 0}>
            <Combine /> Merge {picked.length || ""} into {taskRef}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
