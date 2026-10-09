"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FileUp,
  Link2,
  MessageCircleQuestion,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  StickyNote,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { ProgressRing } from "@/components/ui/progress-ring";
import { RichText } from "@/components/ui/rich-text";
import { Segmented } from "@/components/ui/segmented";
import {
  addChecklistItem,
  addLink,
  addNote,
  archiveTask,
  postComment,
  postProgressUpdate,
  removeAttachment,
  removeChecklistItem,
  requestUpdate,
  toggleChecklistItem,
  uploadFile,
} from "@/actions/tasks";
import { dueState, formatCountdown, formatDue, formatLongDate, formatTime } from "@/lib/time";
import { cn, formatBytes, hostOf } from "@/lib/utils";
import { useNow } from "./badges";
import { FileComposer, LinkComposer, NoteComposer } from "./task-form";
import { STATUS_META, STATUS_ORDER, type TaskStatusKey } from "./meta";
import { StatusMenu } from "./status-menu";

/* -------------------------------------------------------------------------- */
/* Header: status + actions                                                   */
/* -------------------------------------------------------------------------- */

export function HeaderStatus({ taskId, status, canChange }: { taskId: string; status: TaskStatusKey; canChange: boolean }) {
  return (
    <StatusMenu taskId={taskId} status={status} disabled={!canChange}>
      {(s, pending) => {
        const m = STATUS_META[s];
        return (
          <span
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface pl-2.5 pr-3 text-[13px] font-medium shadow-xs transition",
              canChange && "hover:border-line-strong",
              pending && "opacity-70",
            )}
          >
            <m.icon className={cn("size-4", m.iconClass)} />
            {m.label}
            {canChange && <ChevronDown className="size-3.5 text-fg-subtle" />}
          </span>
        );
      }}
    </StatusMenu>
  );
}

export function TaskActions({
  taskId,
  taskRef,
  canEdit,
  canRequest,
  assigneeNames,
}: {
  taskId: string;
  taskRef: string;
  canEdit: boolean;
  canRequest: boolean;
  assigneeNames: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [pending, start] = React.useTransition();

  const send = () =>
    start(async () => {
      const res = await requestUpdate(taskId, { message });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setOpen(false);
      setMessage("");
    });

  return (
    <div className="flex items-center gap-2">
      {canRequest && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="soft">
              <MessageCircleQuestion /> Request update
            </Button>
          </DialogTrigger>
          <DialogContent title="Ask for an update" description={`${assigneeNames} will be notified right away.`}>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional — e.g. Where are we on this? Need it for tomorrow's call."
              autoFocus
              maxLength={1000}
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Where are we on this?", "Any blockers I can help with?", "Will this make the deadline?"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMessage(s)}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-fg-muted transition hover:border-brand/40 hover:text-brand"
                >
                  {s}
                </button>
              ))}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogClose>
              <Button onClick={send} loading={pending}>
                <Send /> Send request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {canEdit && (
        <Button asChild variant="secondary">
          <Link href={`/tasks/${taskId}/edit`}>
            <Pencil /> Edit
          </Link>
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={() => {
              navigator.clipboard.writeText(window.location.href.split("#")[0]);
              toast.success(`Link to ${taskRef} copied.`);
            }}
          >
            <Copy /> Copy link
          </DropdownMenuItem>
          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                tone="danger"
                onSelect={async () => {
                  if (!window.confirm(`Delete ${taskRef}? Its history will be kept but it disappears from everyone's lists.`)) return;
                  const res = await archiveTask(taskId);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(`${taskRef} deleted.`);
                  router.push("/tasks");
                }}
              >
                <Trash2 /> Delete task
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Deadline                                                                   */
/* -------------------------------------------------------------------------- */

export function DeadlineCard({ dueAt, status, tz, progress }: { dueAt: string; status: string; tz: string; progress: number }) {
  const now = useNow(15_000);
  const date = new Date(dueAt);
  const state = dueState(date, status, now);
  const tone = {
    done: { ring: "success", text: "text-success", label: "Completed", bg: "from-success/10" },
    overdue: { ring: "danger", text: "text-danger", label: "Overdue", bg: "from-danger/12" },
    urgent: { ring: "danger", text: "text-danger", label: "Due very soon", bg: "from-danger/10" },
    soon: { ring: "warning", text: "text-warning", label: "Due soon", bg: "from-warning/12" },
    upcoming: { ring: "brand", text: "text-brand", label: "On track", bg: "from-brand/10" },
  }[state] as { ring: "success" | "danger" | "warning" | "brand"; text: string; label: string; bg: string };

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-sm")}>
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent", tone.bg)} />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className={cn("flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider", tone.text)}>
            {(state === "urgent" || state === "overdue") && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
              </span>
            )}
            {tone.label}
          </div>
          <div className="mt-2 text-[22px] font-semibold tracking-tight tabular" suppressHydrationWarning>
            {formatTime(date, tz)}
          </div>
          <div className="text-[13.5px] text-fg-muted" suppressHydrationWarning>
            {formatLongDate(date, tz)}
          </div>
          {state !== "done" && (
            <div className={cn("mt-3 inline-flex items-center rounded-full bg-surface px-2.5 py-1 text-xs font-semibold ring-1 ring-line tabular", tone.text)} suppressHydrationWarning>
              {formatCountdown(date, now)}
            </div>
          )}
        </div>
        <ProgressRing value={status === "DONE" ? 100 : progress} size={72} stroke={6} tone={tone.ring} className="[&>span]:text-[15px] [&>span]:text-fg" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Checklist                                                                  */
/* -------------------------------------------------------------------------- */

export function ChecklistPanel({
  taskId,
  items: initial,
  canContribute,
}: {
  taskId: string;
  items: { id: string; text: string; done: boolean }[];
  canContribute: boolean;
}) {
  const [items, setItems] = React.useState(initial);
  const [text, setText] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  React.useEffect(() => setItems(initial), [initial]);

  const done = items.filter((i) => i.done).length;

  const toggle = async (id: string, value: boolean) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, done: value } : i)));
    const res = await toggleChecklistItem(id, value);
    if (!res.ok) {
      setItems((list) => list.map((i) => (i.id === id ? { ...i, done: !value } : i)));
      toast.error(res.error);
    }
  };

  const add = async () => {
    if (!text.trim()) return;
    setAdding(true);
    const res = await addChecklistItem(taskId, text);
    setAdding(false);
    if (!res.ok) return void toast.error(res.error);
    setText("");
  };

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <motion.div
              className="h-full rounded-full bg-success"
              initial={false}
              animate={{ width: `${(done / items.length) * 100}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <span className="text-xs font-medium text-fg-subtle tabular">
            {done}/{items.length}
          </span>
        </div>
      )}
      <ul className="space-y-0.5">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-hover"
            >
              <button
                type="button"
                disabled={!canContribute}
                onClick={() => toggle(item.id, !item.done)}
                className={cn(
                  "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition",
                  item.done ? "border-success bg-success text-white" : "border-line-strong hover:border-brand",
                )}
                aria-label={item.done ? "Mark not done" : "Mark done"}
              >
                <AnimatePresence>
                  {item.done && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 600, damping: 20 }}>
                      <Check className="size-3" strokeWidth={3.5} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
              <span className={cn("flex-1 text-[13.5px] transition-colors", item.done && "text-fg-subtle line-through")}>{item.text}</span>
              {canContribute && (
                <button
                  type="button"
                  onClick={async () => {
                    setItems((l) => l.filter((i) => i.id !== item.id));
                    const res = await removeChecklistItem(item.id);
                    if (!res.ok) toast.error(res.error);
                  }}
                  className="rounded p-1 text-fg-subtle opacity-0 transition group-hover:opacity-100 hover:text-danger"
                  aria-label="Remove step"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {items.length === 0 && <p className="px-2 pb-2 text-[13px] text-fg-subtle">No steps yet.</p>}
      {canContribute && (
        <div className="mt-2 flex items-center gap-2 px-2">
          <Plus className="size-4 text-fg-subtle" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            placeholder="Add a step"
            disabled={adding}
            className="h-8 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-subtle"
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Attachments                                                                */
/* -------------------------------------------------------------------------- */

export interface ClientAttachment {
  id: string;
  kind: "LINK" | "NOTE" | "FILE";
  title: string;
  url: string | null;
  content: string | null;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string; avatarHue: number };
  canRemove: boolean;
}

export function AttachmentsPanel({
  taskId,
  attachments,
  canContribute,
  maxUploadBytes,
}: {
  taskId: string;
  attachments: ClientAttachment[];
  canContribute: boolean;
  maxUploadBytes: number;
}) {
  const [tab, setTab] = React.useState<"link" | "note" | "file">("link");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? "Added.");
    setOpen(false);
  };

  return (
    <div>
      {attachments.length === 0 ? (
        <p className="text-[13px] text-fg-subtle">No links, notes or documents yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {attachments.map((a) => (
            <AttachmentCard key={a.id} a={a} />
          ))}
        </ul>
      )}
      {canContribute && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary" size="sm" className="mt-3">
              <Plus /> Add link, text or document
            </Button>
          </DialogTrigger>
          <DialogContent title="Attach to this task" description="Everyone on the task will be able to see it." size="lg">
            <Segmented
              layoutId="detail-attach-tab"
              value={tab}
              onChange={setTab}
              className="mb-4"
              options={[
                { value: "link", label: "Link", icon: <Link2 /> },
                { value: "note", label: "Text", icon: <StickyNote /> },
                { value: "file", label: "Document", icon: <FileUp /> },
              ]}
            />
            {tab === "link" && <LinkComposer busy={busy} onAdd={(l) => run(() => addLink(taskId, l))} />}
            {tab === "note" && <NoteComposer busy={busy} onAdd={(n) => run(() => addNote(taskId, n))} />}
            {tab === "file" && (
              <FileComposer
                busy={busy}
                maxBytes={maxUploadBytes}
                onAdd={(files) =>
                  run(async () => {
                    for (const f of files) {
                      const fd = new FormData();
                      fd.set("file", f);
                      const res = await uploadFile(taskId, fd);
                      if (!res.ok) return res;
                    }
                    return { ok: true, message: files.length > 1 ? `${files.length} files uploaded.` : "File uploaded." };
                  })
                }
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AttachmentCard({ a }: { a: ClientAttachment }) {
  const [expanded, setExpanded] = React.useState(false);
  const icon =
    a.kind === "LINK" ? <Link2 /> : a.kind === "NOTE" ? <StickyNote /> : <FileText />;
  const tone =
    a.kind === "LINK" ? "bg-brand-soft text-brand-soft-fg" : a.kind === "NOTE" ? "bg-warning-soft text-warning" : "bg-violet-500/10 text-violet-600 dark:text-violet-300";

  const remove = async () => {
    if (!window.confirm(`Remove "${a.title}"?`)) return;
    const res = await removeAttachment(a.id);
    if (!res.ok) toast.error(res.error);
    else toast.success("Removed.");
  };

  const body = (
    <div className="flex items-start gap-3">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] [&_svg]:size-4", tone)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-fg">{a.title}</div>
        <div className="mt-0.5 truncate text-xs text-fg-subtle">
          {a.kind === "LINK" && hostOf(a.url!)}
          {a.kind === "FILE" && `${a.fileName} · ${formatBytes(a.size ?? 0)}`}
          {a.kind === "NOTE" && `Note by ${a.createdBy.firstName}`}
        </div>
      </div>
      {a.kind === "LINK" && <ExternalLink className="mt-1 size-3.5 shrink-0 text-fg-subtle" />}
      {a.kind === "FILE" && <Download className="mt-1 size-3.5 shrink-0 text-fg-subtle" />}
    </div>
  );

  return (
    <li className={cn("group relative rounded-xl border border-line bg-surface p-3 transition hover:border-line-strong hover:shadow-sm", a.kind === "NOTE" && expanded && "sm:col-span-2")}>
      {a.kind === "LINK" && (
        <a href={a.url!} target="_blank" rel="noopener noreferrer nofollow" className="block">
          {body}
        </a>
      )}
      {a.kind === "FILE" && (
        <a href={`/api/files/${a.id}`} target="_blank" rel="noopener" className="block">
          {body}
        </a>
      )}
      {a.kind === "NOTE" && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="block w-full text-left">
          {body}
          <AnimatePresence initial={false}>
            {expanded ? (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-3 rounded-lg bg-surface-sunken p-3">
                  <RichText text={a.content ?? ""} className="text-[13.5px]" />
                </div>
              </motion.div>
            ) : (
              <p className="mt-2 line-clamp-2 text-[12.5px] text-fg-muted">{a.content}</p>
            )}
          </AnimatePresence>
        </button>
      )}
      {a.canRemove && (
        <button
          type="button"
          onClick={remove}
          className="absolute -right-2 -top-2 hidden h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-fg-subtle shadow-sm transition hover:text-danger group-hover:flex"
          aria-label="Remove attachment"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Composer: comment or progress update                                       */
/* -------------------------------------------------------------------------- */

export function ActivityComposer({
  taskId,
  me,
  canUpdate,
  currentProgress,
  currentStatus,
  focusUpdate,
}: {
  taskId: string;
  me: { firstName: string; lastName: string; avatarHue: number };
  canUpdate: boolean;
  currentProgress: number;
  currentStatus: TaskStatusKey;
  focusUpdate: boolean;
}) {
  const [mode, setMode] = React.useState<"comment" | "update">(focusUpdate && canUpdate ? "update" : "comment");
  const [text, setText] = React.useState("");
  const [progress, setProgress] = React.useState(currentProgress);
  const [status, setStatus] = React.useState<TaskStatusKey | "">("");
  const [pending, start] = React.useTransition();
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => setProgress(currentProgress), [currentProgress]);

  React.useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#post-update" && canUpdate) {
        setMode("update");
        ref.current?.focus();
      }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [canUpdate]);

  const submit = () =>
    start(async () => {
      const res =
        mode === "comment"
          ? await postComment(taskId, text)
          : await postProgressUpdate(taskId, { body: text, progress, status: status || undefined });
      if (!res.ok) return void toast.error(res.error);
      if (mode === "update") toast.success(res.message ?? "Update posted.");
      setText("");
      setStatus("");
    });

  return (
    <div id="post-update" className="scroll-mt-28 rounded-2xl border border-line bg-surface p-3 shadow-xs focus-within:border-brand/40 focus-within:ring-4 focus-within:ring-ring/25">
      <div className="flex items-start gap-3">
        <Avatar person={me} size="md" className="mt-1 hidden sm:inline-flex" />
        <div className="min-w-0 flex-1">
          {canUpdate && (
            <Segmented
              layoutId="composer-mode"
              size="sm"
              value={mode}
              onChange={setMode}
              className="mb-2"
              options={[
                { value: "comment", label: "Comment" },
                { value: "update", label: "Progress update", icon: <TrendingUp /> },
              ]}
            />
          )}
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && text.trim()) submit();
            }}
            placeholder={mode === "comment" ? "Write a comment…" : "What's done, what's next, anything blocking?"}
            rows={3}
            className="w-full resize-none bg-transparent px-1 py-1.5 text-[14px] leading-relaxed outline-none placeholder:text-fg-subtle"
          />
          <AnimatePresence initial={false}>
            {mode === "update" && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="flex flex-col gap-3 rounded-xl bg-surface-sunken/70 p-3 sm:flex-row sm:items-center">
                  <div className="flex flex-1 items-center gap-3">
                    <span className="text-xs font-medium text-fg-muted">Progress</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={progress}
                      onChange={(e) => setProgress(Number(e.target.value))}
                      className="h-1.5 flex-1 cursor-pointer accent-[var(--brand)]"
                    />
                    <span className="w-10 text-right text-[13px] font-semibold tabular">{progress}%</span>
                  </div>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatusKey | "")}
                    className="h-8 rounded-lg border border-line bg-surface px-2 text-xs outline-none"
                  >
                    <option value="">Keep status ({STATUS_META[currentStatus].label})</option>
                    {STATUS_ORDER.filter((s) => s !== currentStatus).map((s) => (
                      <option key={s} value={s}>
                        Move to {STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mt-2 flex items-center justify-between">
            <span className="hidden text-[11px] text-fg-subtle sm:inline">⌘/Ctrl + Enter to send</span>
            <Button size="sm" onClick={submit} disabled={!text.trim()} loading={pending} className="ml-auto">
              <Send /> {mode === "comment" ? "Comment" : "Post update"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LocalDue({ dueAt, tz }: { dueAt: string; tz: string }) {
  const now = useNow();
  return <span suppressHydrationWarning>{formatDue(new Date(dueAt), tz, now)}</span>;
}
