"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, FileCheck2, FileText, Link2, PenLine, Plus, RotateCcw, Send, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { reviewSubmission, submitWork } from "@/actions/tasks";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { RichText } from "@/components/ui/rich-text";
import { timeAgo } from "@/lib/time";
import { cn, formatBytes } from "@/lib/utils";
import { AttachmentCard, type ClientAttachment } from "./task-detail-client";

const MIN_WRITEUP = 40;
const PROOF_ACCEPT = ".pdf,.doc,.docx,.odt,.rtf,.txt,.md,.pages,.xls,.xlsx,.ods,.csv,.numbers,.ppt,.pptx,.odp,.key,.png,.jpg,.jpeg,.webp,.heic,.zip";
const PROOF_EXTENSIONS = new Set(PROOF_ACCEPT.split(",").map((e) => e.slice(1)));

/**
 * Handing in the work. Nothing goes in empty-handed: at least one of a written
 * account, a document or a link has to come with it.
 */
export function SubmitWorkPanel({
  taskId,
  maxUploadBytes,
  reviewer,
  sentBack,
}: {
  taskId: string;
  maxUploadBytes: number;
  reviewer: string;
  /** The reviewer's note when the last submission was sent back. */
  sentBack?: string | null;
}) {
  const router = useRouter();
  const [summary, setSummary] = React.useState("");
  const [link, setLink] = React.useState("");
  const [links, setLinks] = React.useState<string[]>([]);
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  const total = files.reduce((s, f) => s + f.size, 0);
  const proof = {
    writeup: summary.trim().length >= MIN_WRITEUP,
    document: files.length > 0,
    link: links.length > 0,
  };
  const ready = (proof.writeup || proof.document || proof.link) && total <= maxUploadBytes;

  const addLink = () => {
    const v = link.trim();
    if (!v) return;
    try {
      const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
      setLinks((l) => [...l, u.toString()]);
      setLink("");
    } catch {
      toast.error("That doesn't look like a link.");
    }
  };

  const pick = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const ok = picked.filter((f) => PROOF_EXTENSIONS.has(f.name.split(".").pop()?.toLowerCase() ?? ""));
    if (ok.length < picked.length) {
      toast.error(
        `${picked
          .filter((f) => !ok.includes(f))
          .map((f) => f.name)
          .join(", ")}: attach a document — PDF, Word, a spreadsheet, slides or a screenshot.`,
      );
    }
    const next = [...files, ...ok].slice(0, 5);
    if (next.reduce((s, f) => s + f.size, 0) > maxUploadBytes)
      toast.error(`Files can be up to ${formatBytes(maxUploadBytes)} in total. Add a link for anything bigger.`);
    setFiles(next);
  };

  const submit = async () => {
    const fd = new FormData();
    fd.set("summary", summary);
    for (const l of links) fd.append("link", l);
    for (const f of files) fd.append("file", f);
    setBusy(true);
    try {
      const res = await submitWork(taskId, fd);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message ?? "Submitted.");
      router.refresh();
    } catch {
      toast.error("That didn't go through — the files may be too large. Try a smaller file or a link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="submit" className="scroll-mt-24 overflow-hidden rounded-2xl border border-brand/25 bg-surface shadow-sm">
      <div className="h-1 bg-gradient-to-r from-brand-400 via-brand-600 to-brand-800" />
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand-soft-fg">
            <FileCheck2 className="size-[18px]" />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Submit your work</h3>
            <p className="mt-0.5 text-[13px] text-fg-muted">{reviewer} reviews it and marks the task done. Add proof — at least one of the three below.</p>
          </div>
        </div>

        {sentBack && (
          <div className="mt-4 rounded-xl border border-warning/25 bg-warning-soft px-3.5 py-3 text-[13px]">
            <div className="flex items-center gap-1.5 font-semibold text-warning">
              <RotateCcw className="size-3.5" /> Sent back with changes
            </div>
            <p className="mt-1 text-fg">{sentBack}</p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          {(
            [
              ["writeup", "Write-up", PenLine],
              ["document", "Document", FileText],
              ["link", "Link", Link2],
            ] as const
          ).map(([key, label, Icon]) => (
            <div
              key={key}
              className={cn(
                "flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-2 py-2 text-[12.5px] font-medium transition-colors sm:justify-start sm:px-3",
                proof[key] ? "border-success/30 bg-success-soft text-success" : "border-line text-fg-subtle",
              )}
            >
              {proof[key] ? <Check className="size-3.5 shrink-0" strokeWidth={3} /> : <Icon className="size-3.5 shrink-0" />}
              {label}
            </div>
          ))}
        </div>

        <label className="mt-4 block text-[13px] font-medium" htmlFor="submit-summary">
          What did you do?
        </label>
        <Textarea
          id="submit-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          maxLength={20000}
          placeholder="Describe the work and where to find it. A write-up of 40+ characters counts as proof on its own."
          className="mt-1.5"
        />
        <p className="mt-1 text-right text-[11.5px] text-fg-subtle tabular">
          {summary.trim().length < MIN_WRITEUP ? `${MIN_WRITEUP - summary.trim().length} more characters to count as proof` : "Counts as proof"}
        </p>

        <div className="mt-2 text-[13px] font-medium">Documents</div>
        <div className="mt-1.5 space-y-2">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-[13px]">
              <FileText className="size-4 shrink-0 text-brand" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-fg-subtle tabular">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
                className="rounded p-0.5 text-fg-subtle hover:text-danger"
                aria-label={`Remove ${f.name}`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-3 py-3 text-[13px] font-medium text-fg-muted transition hover:border-brand/50 hover:text-brand"
          >
            <Plus className="size-4" /> Attach Word, PDF, slides or a spreadsheet
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept={PROOF_ACCEPT}
            className="hidden"
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="text-[11.5px] text-fg-subtle">
            Up to {formatBytes(maxUploadBytes)} in total
            {files.length ? ` · ${formatBytes(total)} added` : ""}.
          </p>
        </div>

        <div className="mt-3 text-[13px] font-medium">Links</div>
        {links.map((l, i) => (
          <div key={l + i} className="mt-1.5 flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-[13px]">
            <Link2 className="size-4 shrink-0 text-brand" />
            <span className="min-w-0 flex-1 truncate">{l}</span>
            <button
              type="button"
              onClick={() => setLinks((x) => x.filter((_, j) => j !== i))}
              className="rounded p-0.5 text-fg-subtle hover:text-danger"
              aria-label="Remove link"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <div className="mt-1.5 flex gap-2">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink();
              }
            }}
            placeholder="https://docs.google.com/…"
            className="flex-1"
          />
          <Button type="button" variant="secondary" onClick={addLink} disabled={!link.trim()}>
            Add
          </Button>
        </div>

        <Button className="mt-5 w-full" size="lg" onClick={submit} loading={busy} disabled={!ready}>
          <Send /> Submit for review
        </Button>
        {!ready && <p className="mt-2 text-center text-[12px] text-fg-subtle">Add a write-up, a document or a link to submit.</p>}
      </div>
    </div>
  );
}

export interface ClientSubmission {
  id: string;
  status: "SUBMITTED" | "ACCEPTED" | "CHANGES_REQUESTED";
  summary: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  submittedBy: {
    id: string;
    firstName: string;
    lastName: string;
    avatarHue: number;
  };
  reviewedBy: { firstName: string; lastName: string } | null;
  attachments: ClientAttachment[];
}

const STATUS: Record<ClientSubmission["status"], { label: string; tone: "info" | "success" | "warning" }> = {
  SUBMITTED: { label: "Waiting for review", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "warning" },
};

/** Every hand-in with its proof, newest first, and the reviewer's verdict. */
export function SubmissionsPanel({ submissions, canReview }: { submissions: ClientSubmission[]; canReview: boolean }) {
  return (
    <ol className="space-y-4">
      {submissions.map((s) => (
        <li key={s.id} className="rounded-xl border border-line bg-surface-sunken/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Avatar person={s.submittedBy} size="sm" />
            <span className="text-[13.5px] font-medium">
              {s.submittedBy.firstName} {s.submittedBy.lastName}
            </span>
            <span className="text-xs text-fg-subtle" suppressHydrationWarning>
              submitted {timeAgo(new Date(s.createdAt))}
            </span>
            <Badge tone={STATUS[s.status].tone} className="ml-auto">
              {STATUS[s.status].label}
            </Badge>
          </div>
          {s.summary && <RichText text={s.summary} className="mt-3 text-[13.5px]" />}
          {s.attachments.length > 0 && (
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {s.attachments.map((a) => (
                <AttachmentCard key={a.id} a={a} />
              ))}
            </ul>
          )}
          {s.reviewedBy && (
            <div className={cn("mt-3 rounded-lg px-3 py-2 text-[13px]", s.status === "ACCEPTED" ? "bg-success-soft text-fg" : "bg-warning-soft text-fg")}>
              <span className="font-semibold">{s.reviewedBy.firstName}</span> {s.status === "ACCEPTED" ? "accepted it" : "asked for changes"}
              {s.reviewNote ? <>: {s.reviewNote}</> : "."}
            </div>
          )}
          {canReview && s.status === "SUBMITTED" && <ReviewControls submissionId={s.id} />}
        </li>
      ))}
    </ol>
  );
}

function ReviewControls({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<null | "accept" | "changes">(null);

  const decide = async (decision: "accept" | "changes") => {
    setBusy(decision);
    try {
      const res = await reviewSubmission(submissionId, {
        decision,
        note: decision === "changes" ? note : "",
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message ?? "Done.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button onClick={() => decide("accept")} loading={busy === "accept"}>
        <BadgeCheck /> Accept — mark done
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary">
            <Undo2 /> Request changes
          </Button>
        </DialogTrigger>
        <DialogContent title="Send it back" description="Say what needs to change. Deadline reminders start again until it's resubmitted.">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="e.g. Add the vendor quotes and the comparison table."
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => decide("changes")} loading={busy === "changes"} disabled={note.trim().length < 3}>
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
