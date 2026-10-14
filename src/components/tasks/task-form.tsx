"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { FileText, FileUp, Link2, ListChecks, Plus, Repeat, StickyNote, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { createTask, updateTask, uploadFile } from "@/actions/tasks";
import { useMounted } from "@/lib/hooks";
import { cn, formatBytes, hostOf, safeHttpUrl } from "@/lib/utils";
import { AssigneePicker, type PickablePerson } from "./assignee-picker";
import { DuePicker, toLocalInput } from "./due-picker";
import { PRIORITY_META, PRIORITY_ORDER, type TaskPriorityKey } from "./meta";

type AttachTab = "link" | "note" | "file";
type RepeatChoice = "NONE" | "DAILY" | "WEEKDAYS" | "WEEKLY";

const REPEAT_OPTIONS: { value: RepeatChoice; label: string; noun: string }[] = [
  { value: "NONE", label: "Doesn't repeat", noun: "" },
  { value: "DAILY", label: "Every day", noun: "day" },
  { value: "WEEKDAYS", label: "Every weekday (Mon–Fri)", noun: "weekday" },
  { value: "WEEKLY", label: "Every week", noun: "week" },
];

/** The deadlines a repeat will produce, in the browser's time (the same rules the server applies). */
function previewDates(start: Date, repeat: RepeatChoice, count: number) {
  const weekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
  const step = (d: Date) => {
    const n = new Date(d);
    n.setDate(n.getDate() + (repeat === "WEEKLY" ? 7 : 1));
    while (repeat === "WEEKDAYS" && weekend(n)) n.setDate(n.getDate() + 1);
    return n;
  };
  const first = new Date(start);
  while (repeat === "WEEKDAYS" && weekend(first)) first.setDate(first.getDate() + 1);
  const out = [first];
  while (out.length < count) out.push(step(out[out.length - 1]));
  return out;
}

export interface TaskFormInitial {
  id: string;
  title: string;
  description: string;
  priority: TaskPriorityKey;
  dueAt: string;
  assigneeIds: string[];
  leadId?: string;
}

export function TaskForm({
  people,
  selfId,
  canAssignOthers,
  maxUploadBytes,
  initial,
  presetAssignee,
  canRepeat = false,
}: {
  people: PickablePerson[];
  selfId: string;
  canAssignOthers: boolean;
  maxUploadBytes: number;
  initial?: TaskFormInitial;
  presetAssignee?: string;
  /** Founders can set a task to repeat (e.g. every day for 30 days). */
  canRepeat?: boolean;
}) {
  const router = useRouter();
  const editing = !!initial;
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [priority, setPriority] = React.useState<TaskPriorityKey>(initial?.priority ?? "MEDIUM");
  // datetime-local speaks local time, which only the browser knows: until the
  // user edits it, an existing deadline is shown converted after hydration.
  const mounted = useMounted();
  const [editedDue, setDue] = React.useState<string | null>(null);
  const due = editedDue ?? (initial && mounted ? toLocalInput(new Date(initial.dueAt)) : "");
  const [assignees, setAssignees] = React.useState<string[]>(
    initial?.assigneeIds ?? (presetAssignee ? [presetAssignee] : canAssignOthers ? [] : [selfId]),
  );
  // The lead answers for the task; everyone else follows. Defaults to the first person picked.
  const [chosenLead, setLead] = React.useState<string | null>(initial?.leadId ?? null);
  const leadId = chosenLead && assignees.includes(chosenLead) ? chosenLead : (assignees[0] ?? null);
  const [links, setLinks] = React.useState<{ title: string; url: string }[]>([]);
  const [notes, setNotes] = React.useState<{ title: string; content: string }[]>([]);
  const [files, setFiles] = React.useState<File[]>([]);
  const [checklist, setChecklist] = React.useState<string[]>([]);
  const [tab, setTab] = React.useState<AttachTab>("link");
  const [pending, setPending] = React.useState(false);
  const [repeat, setRepeat] = React.useState<RepeatChoice>("NONE");
  // Kept as text so the field can be cleared and retyped without snapping back.
  const [repeatCount, setRepeatCount] = React.useState("30");
  const count = Math.floor(Number(repeatCount));
  const countValid = Number.isInteger(count) && count >= 2 && count <= 90;
  const repeating = canRepeat && !editing && repeat !== "NONE";
  const preview = repeating && due && countValid ? previewDates(new Date(due), repeat, count) : null;


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!due) return toast.error("Pick a due date and time.");
    if (assignees.length === 0) return toast.error("Assign the task to at least one person.");
    const dueAt = new Date(due).toISOString();
    setPending(true);
    try {
      if (editing) {
        const res = await updateTask(initial!.id, { title, description, priority, dueAt, assigneeIds: assignees, leadId: leadId ?? undefined });
        if (!res.ok) return void toast.error(res.error);
        toast.success("Task updated.");
        router.push(`/tasks/${initial!.id}`);
        return;
      }
      if (repeating && !countValid) return void toast.error("Repeat between 2 and 90 times.");
      const res = await createTask({
        title,
        description,
        priority,
        dueAt,
        assigneeIds: assignees,
        leadId: leadId ?? undefined,
        links,
        notes,
        checklist,
        repeat: repeating ? { frequency: repeat as Exclude<RepeatChoice, "NONE">, count } : undefined,
      });
      if (!res.ok) return void toast.error(res.error);
      const id = res.data!.id;
      for (const f of files) {
        const fd = new FormData();
        fd.set("file", f);
        // A body over the host's limit (4.5 MB on Vercel) is rejected before the action runs, so it throws.
        const up = await uploadFile(id, fd).catch(() => ({ ok: false as const, error: "couldn't be uploaded. Try a smaller file or attach a link." }));
        if (!up.ok) toast.error(`${f.name}: ${up.error}`);
      }
      toast.success(repeating ? "Repeating task set up" : "Task created", {
        description: repeating
          ? res.message
          : assignees.some((a) => a !== selfId)
            ? "The assignees have been notified."
            : "It's on your list.",
      });
      router.push(`/tasks/${id}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <Card className="p-5 sm:p-6">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            aria-label="Task title"
            className="w-full bg-transparent text-[22px] font-semibold tracking-[-0.02em] text-fg outline-none placeholder:text-fg-subtle/70 focus-visible:outline-none sm:text-[26px]"
            maxLength={200}
            autoFocus={!editing}
            required
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add context: the goal, what good looks like, anything they should know…"
            aria-label="Brief"
            className="mt-4 min-h-36 border-0 bg-surface-sunken/60 shadow-none focus:bg-surface"
            maxLength={20000}
          />
        </Card>

        {!editing && (
          <>
            <Card className="p-5 sm:p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold">Attachments</h3>
                  <p className="text-[13px] text-fg-muted">Links, written notes and documents they&apos;ll need.</p>
                </div>
                <Segmented
                  layoutId="attach-tab"
                  size="sm"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "link", label: "Link", icon: <Link2 /> },
                    { value: "note", label: "Text", icon: <StickyNote /> },
                    { value: "file", label: "Document", icon: <FileUp /> },
                  ]}
                />
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  {tab === "link" && <LinkComposer onAdd={(l) => setLinks((x) => [...x, l])} />}
                  {tab === "note" && <NoteComposer onAdd={(n) => setNotes((x) => [...x, n])} />}
                  {tab === "file" && (
                    <FileComposer maxBytes={maxUploadBytes} onAdd={(f) => setFiles((x) => [...x, ...f])} />
                  )}
                </motion.div>
              </AnimatePresence>

              {(links.length > 0 || notes.length > 0 || files.length > 0) && (
                <ul className="mt-4 space-y-2">
                  {links.map((l, i) => (
                    <PendingItem key={`l${i}`} icon={<Link2 />} title={l.title || hostOf(l.url)} meta={l.url} onRemove={() => setLinks((x) => x.filter((_, j) => j !== i))} />
                  ))}
                  {notes.map((n, i) => (
                    <PendingItem key={`n${i}`} icon={<StickyNote />} title={n.title} meta={`${n.content.slice(0, 80)}${n.content.length > 80 ? "…" : ""}`} onRemove={() => setNotes((x) => x.filter((_, j) => j !== i))} />
                  ))}
                  {files.map((f, i) => (
                    <PendingItem key={`f${i}`} icon={<FileText />} title={f.name} meta={formatBytes(f.size)} onRemove={() => setFiles((x) => x.filter((_, j) => j !== i))} />
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5 sm:p-6">
              <div className="mb-3 flex items-center gap-2">
                <ListChecks className="size-4 text-brand" />
                <h3 className="text-[15px] font-semibold">Checklist</h3>
                <span className="text-[13px] text-fg-subtle">— break it into steps (optional)</span>
              </div>
              <ChecklistComposer items={checklist} onChange={setChecklist} />
            </Card>
          </>
        )}
      </div>

      <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5 p-5 sm:p-6">
          <Field label="Assign to" hint={assignees.length > 1 ? "One person leads; the rest follow. Choose who leads." : undefined}>
            <AssigneePicker
              people={people}
              value={assignees}
              onChange={setAssignees}
              leadId={leadId}
              onLeadChange={setLead}
              selfId={selfId}
              restrictedToSelf={!canAssignOthers}
            />
          </Field>
          <Field label={repeating ? "First deadline" : "Deadline"} htmlFor="due" hint="Date and time, in your time zone.">
            <DuePicker id="due" value={due} onChange={setDue} />
          </Field>
          {canRepeat && !editing && (
            <Field label="Repeat" htmlFor="repeat">
              <div className="flex gap-2">
                <NativeSelect id="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatChoice)} className="min-w-0">
                  {REPEAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
                {repeat !== "NONE" && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Input
                      inputMode="numeric"
                      value={repeatCount}
                      onChange={(e) => setRepeatCount(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      className="w-16 text-center"
                      aria-label="How many times"
                      aria-invalid={!countValid}
                    />
                    <span className="text-[13px] text-fg-muted">times</span>
                  </div>
                )}
              </div>
              {repeat !== "NONE" && (
                <div className="mt-2 flex gap-2 rounded-xl border border-brand/20 bg-brand-soft/40 px-3 py-2.5 text-[12.5px] text-fg-muted">
                  <Repeat className="mt-0.5 size-3.5 shrink-0 text-brand" />
                  <span>
                    {!countValid ? (
                      "Choose between 2 and 90 times."
                    ) : preview ? (
                      <>
                        <span className="font-medium text-fg">{count} tasks</span>,{" "}
                        {preview[0].toLocaleDateString([], { day: "numeric", month: "short" })} →{" "}
                        {preview[preview.length - 1].toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}. Each appears{" "}
                        {repeat === "WEEKLY" ? "a week" : "a day"} before its deadline, so the assignee sees one at a time. Links, notes and steps are
                        copied to every one; uploaded files go on the first.
                      </>
                    ) : (
                      "Pick the first deadline to see the dates."
                    )}
                  </span>
                </div>
              )}
            </Field>
          )}
          <Field label="Priority">
            <div className="grid grid-cols-4 gap-1.5">
              {PRIORITY_ORDER.slice()
                .reverse()
                .map((p) => {
                  const m = PRIORITY_META[p];
                  const on = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition",
                        on ? "border-brand/50 bg-brand-soft text-fg shadow-xs" : "border-line text-fg-muted hover:border-line-strong",
                      )}
                    >
                      <m.icon className={cn("size-4", m.className)} />
                      {m.label}
                    </button>
                  );
                })}
            </div>
          </Field>
        </Card>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" className="flex-[2]" loading={pending}>
            {editing ? "Save changes" : repeating && countValid ? `Create ${count} & notify` : "Create & notify"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function PendingItem({ icon, title, meta, onRemove }: { icon: React.ReactNode; title: string; meta: string; onRemove: () => void }) {
  return (
    <motion.li
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-3 rounded-xl border border-line bg-surface-sunken/50 px-3 py-2.5"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-fg [&_svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{title}</span>
        <span className="block truncate text-xs text-fg-subtle">{meta}</span>
      </span>
      <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-fg-subtle hover:bg-surface-hover hover:text-danger" aria-label="Remove">
        <X className="size-4" />
      </button>
    </motion.li>
  );
}

export function LinkComposer({ onAdd, busy }: { onAdd: (l: { title: string; url: string }) => void | Promise<void>; busy?: boolean }) {
  const [url, setUrl] = React.useState("");
  const [title, setTitle] = React.useState("");
  const add = async () => {
    const withScheme = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    const safe = safeHttpUrl(withScheme);
    if (!url.trim() || !safe) return toast.error("Enter a valid web link.");
    await onAdd({ title: title.trim(), url: safe });
    setUrl("");
    setTitle("");
  };
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://docs.google.com/…"
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
      />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Label (optional)" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
      <Button type="button" variant="secondary" onClick={add} loading={busy}>
        <Plus /> Add link
      </Button>
    </div>
  );
}

export function NoteComposer({ onAdd, busy }: { onAdd: (n: { title: string; content: string }) => void | Promise<void>; busy?: boolean }) {
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const add = async () => {
    if (!title.trim() || !content.trim()) return toast.error("Give the note a title and some text.");
    await onAdd({ title: title.trim(), content: content.trim() });
    setTitle("");
    setContent("");
  };
  return (
    <div className="space-y-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title — e.g. Must-haves" />
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write the details, a list, instructions…" className="min-h-28" />
      <div className="flex justify-end">
        <Button type="button" variant="secondary" onClick={add} loading={busy}>
          <Plus /> Add note
        </Button>
      </div>
    </div>
  );
}

export function FileComposer({ onAdd, maxBytes, busy }: { onAdd: (files: File[]) => void | Promise<void>; maxBytes: number; busy?: boolean }) {
  const [drag, setDrag] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const accept = (list: FileList | null) => {
    if (!list) return;
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > maxBytes) toast.error(`${f.name} is larger than ${formatBytes(maxBytes)}. Share a Drive link instead.`);
      else ok.push(f);
    }
    if (ok.length) onAdd(ok);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        accept(e.dataTransfer.files);
      }}
      onClick={() => input.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition",
        drag ? "border-brand bg-brand-soft" : "border-line-strong hover:border-brand/50 hover:bg-surface-hover",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <motion.span animate={drag ? { y: -4, scale: 1.08 } : { y: 0, scale: 1 }} className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-fg">
        <FileUp className="size-5" />
      </motion.span>
      <p className="mt-3 text-[13.5px] font-medium">{busy ? "Uploading…" : "Drop documents here, or click to browse"}</p>
      <p className="mt-1 text-xs text-fg-subtle">PDF, Office docs, images, spreadsheets · up to {formatBytes(maxBytes)} each</p>
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => accept(e.target.files)} />
    </div>
  );
}

function ChecklistComposer({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const [text, setText] = React.useState("");
  const add = () => {
    if (!text.trim()) return;
    onChange([...items, text.trim()]);
    setText("");
  };
  return (
    <div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-hover">
            <span className="h-4 w-4 shrink-0 rounded-[5px] border border-line-strong" />
            <span className="min-w-0 flex-1 text-[13.5px] wrap-anywhere">{item}</span>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="-my-1 shrink-0 rounded-lg p-2 text-fg-subtle transition hover:text-danger focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100" aria-label="Remove step">
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a step and press Enter" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <Button type="button" variant="secondary" onClick={add}>
          <Plus /> Add
        </Button>
      </div>
    </div>
  );
}
