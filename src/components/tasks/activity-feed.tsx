import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Combine,
  Crown,
  FileCheck2,
  Flag,
  MessageCircleQuestion,
  Paperclip,
  Pencil,
  Sparkles,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { RichText } from "@/components/ui/rich-text";
import { ProgressBar } from "@/components/ui/progress-ring";
import { formatDateTime, timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PRIORITY_META, STATUS_META, type TaskPriorityKey, type TaskStatusKey } from "./meta";

export interface FeedEntry {
  id: string;
  kind: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
  actor: { id: string; firstName: string; lastName: string; avatarHue: number };
}

function Name({ actor }: { actor: FeedEntry["actor"] }) {
  return (
    <span className="font-medium text-fg">
      {actor.firstName} {actor.lastName}
    </span>
  );
}

function When({ date, tz }: { date: Date; tz: string }) {
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date, tz)} className="text-xs text-fg-subtle" suppressHydrationWarning>
      {timeAgo(date)}
    </time>
  );
}

function StatusChip({ s }: { s: string }) {
  const m = STATUS_META[s as TaskStatusKey];
  if (!m) return <span>{s}</span>;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-fg">
      <m.icon className={cn("size-3.5", m.iconClass)} />
      {m.label}
    </span>
  );
}

const REVIEW_TAG: Record<string, { label: string; icon: React.ElementType; chip: string; card: string } | undefined> = {
  WORK_SUBMITTED: { label: "Submitted for review", icon: FileCheck2, chip: "bg-info-soft text-info", card: "border-info/25 bg-info-soft/50" },
  WORK_ACCEPTED: { label: "Accepted the work", icon: BadgeCheck, chip: "bg-success/15 text-success", card: "border-success/25 bg-success-soft/50" },
  CHANGES_REQUESTED: { label: "Asked for changes", icon: Undo2, chip: "bg-warning-soft text-warning", card: "border-warning/25 bg-warning-soft/50" },
};

/** The task's history: conversation as cards, changes as quiet one-liners. */
export function ActivityFeed({ entries, tz }: { entries: FeedEntry[]; tz: string }) {
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-px before:bg-line">
      {entries.map((e) => {
        const meta = e.meta ?? {};

        if (
          e.kind === "COMMENT" ||
          e.kind === "PROGRESS_UPDATE" ||
          e.kind === "UPDATE_REQUESTED" ||
          e.kind === "WORK_SUBMITTED" ||
          e.kind === "WORK_ACCEPTED" ||
          e.kind === "CHANGES_REQUESTED"
        ) {
          const isUpdate = e.kind === "PROGRESS_UPDATE";
          const isRequest = e.kind === "UPDATE_REQUESTED";
          const review = REVIEW_TAG[e.kind];
          return (
            <li key={e.id} className="relative flex gap-3">
              <Avatar person={e.actor} size="md" ring className="relative z-10" />
              <div
                className={cn(
                  "min-w-0 flex-1 rounded-2xl border p-3.5",
                  isUpdate && "border-success/25 bg-success-soft/50",
                  isRequest && "border-info/25 bg-info-soft/60",
                  review?.card,
                  !isUpdate && !isRequest && !review && "border-line bg-surface",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                  <Name actor={e.actor} />
                  {isUpdate && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      Progress update · {String(meta.progress ?? 0)}%
                    </span>
                  )}
                  {isRequest && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info">
                      <MessageCircleQuestion className="size-3" /> Requested an update
                    </span>
                  )}
                  {review && (
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", review.chip)}>
                      <review.icon className="size-3" /> {review.label}
                    </span>
                  )}
                  <When date={e.createdAt} tz={tz} />
                </div>
                {e.body && <RichText text={e.body} className="mt-1.5 text-[13.5px]" />}
                {e.kind === "WORK_SUBMITTED" && (Number(meta.files) > 0 || Number(meta.links) > 0) && (
                  <a href="#submissions" className="mt-2 inline-block text-[12.5px] font-medium text-brand hover:underline">
                    {[Number(meta.files) ? `${meta.files} document${Number(meta.files) === 1 ? "" : "s"}` : null, Number(meta.links) ? `${meta.links} link${Number(meta.links) === 1 ? "" : "s"}` : null]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    attached as proof →
                  </a>
                )}
                {isUpdate && <ProgressBar value={Number(meta.progress ?? 0)} tone="success" className="mt-3" />}
              </div>
            </li>
          );
        }

        let icon = <Sparkles />;
        let text: React.ReactNode = null;
        switch (e.kind) {
          case "CREATED":
            icon = <Sparkles />;
            text = <>created this task</>;
            break;
          case "STATUS_CHANGED":
            icon = <ArrowRight />;
            text = (
              <>
                moved this from <StatusChip s={String(meta.from)} /> to <StatusChip s={String(meta.to)} />
              </>
            );
            break;
          case "PRIORITY_CHANGED": {
            icon = <Flag />;
            const to = PRIORITY_META[meta.to as TaskPriorityKey];
            text = (
              <>
                set priority to <span className="font-medium text-fg">{to?.label ?? String(meta.to)}</span>
              </>
            );
            break;
          }
          case "MERGED": {
            icon = <Combine />;
            const merged = (meta.merged as { ref: string; title: string }[] | undefined) ?? [];
            text = (
              <>
                merged <span className="font-medium text-fg">{merged.map((m) => m.ref).join(", ")}</span> into this task
                {Number(meta.added) > 0 && <> and added {String(meta.added)} {Number(meta.added) === 1 ? "person" : "people"}</>}
              </>
            );
            break;
          }
          case "DUE_CHANGED":
            icon = <CalendarClock />;
            text = (
              <>
                {meta.extended ? "extended the deadline to" : "moved the deadline to"}{" "}
                <span className="font-medium text-fg" suppressHydrationWarning>
                  {formatDateTime(new Date(String(meta.to)), tz)}
                </span>
              </>
            );
            break;
          case "ASSIGNEES_CHANGED": {
            icon = <Users />;
            const added = (meta.added as string[] | undefined) ?? [];
            const removed = (meta.removed as string[] | undefined) ?? [];
            text = (
              <>
                {added.length > 0 && (
                  <>
                    assigned <span className="font-medium text-fg">{added.join(", ")}</span>
                  </>
                )}
                {added.length > 0 && removed.length > 0 && " and "}
                {removed.length > 0 && (
                  <>
                    removed <span className="font-medium text-fg">{removed.join(", ")}</span>
                  </>
                )}
              </>
            );
            break;
          }
          case "EDITED":
            icon = <Pencil />;
            text = <>edited the details</>;
            break;
          case "LEAD_CHANGED":
            icon = <Crown />;
            text = (
              <>
                made <span className="font-medium text-fg">{String(meta.to ?? "someone")}</span> the lead
              </>
            );
            break;
          case "ATTACHMENT_ADDED":
            icon = <Paperclip />;
            text = (
              <>
                attached {meta.kind === "LINK" ? "a link" : meta.kind === "NOTE" ? "a note" : "a document"}{" "}
                <span className="font-medium text-fg">{String(meta.title ?? "")}</span>
              </>
            );
            break;
          case "ATTACHMENT_REMOVED":
            icon = <Trash2 />;
            text = (
              <>
                removed <span className="font-medium text-fg">{String(meta.title ?? "an attachment")}</span>
              </>
            );
            break;
          default:
            text = <>updated the task</>;
        }

        return (
          <li key={e.id} className="relative flex items-center gap-3 pl-1.5">
            <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-fg-subtle [&_svg]:size-3">
              {icon}
            </span>
            <p className="ml-1.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-fg-muted">
              <Name actor={e.actor} /> {text} <When date={e.createdAt} tz={tz} />
              {e.body && <span className="basis-full text-[12.5px] text-fg-subtle">“{e.body}”</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
