"use client";

import * as React from "react";
import { AlarmClock, CalendarClock, CheckCircle2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { dueState, formatCountdown, formatDue } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PRIORITY_META, STATUS_META, type TaskPriorityKey, type TaskStatusKey } from "./meta";

export function StatusBadge({ status, className }: { status: TaskStatusKey; className?: string }) {
  const m = STATUS_META[status];
  return (
    <Badge tone={m.tone} className={className}>
      <m.icon /> {m.label}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: TaskPriorityKey; className?: string }) {
  const m = PRIORITY_META[priority];
  return (
    <Badge tone={m.tone} className={className}>
      <m.icon /> {m.label}
    </Badge>
  );
}

export function PriorityIcon({ priority, className }: { priority: TaskPriorityKey; className?: string }) {
  const m = PRIORITY_META[priority];
  return <m.icon className={cn("size-4 shrink-0", m.className, className)} aria-label={`${m.label} priority`} />;
}

/** Re-renders every 30s so countdowns stay honest without a reload. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const DUE_TONE = {
  done: "text-fg-subtle",
  overdue: "text-danger",
  urgent: "text-danger",
  soon: "text-warning",
  upcoming: "text-fg-muted",
} as const;

export function DueLabel({
  dueAt,
  status,
  tz,
  mode = "date",
  className,
}: {
  dueAt: string;
  status: string;
  tz: string;
  mode?: "date" | "countdown" | "both";
  className?: string;
}) {
  const now = useNow();
  const date = new Date(dueAt);
  const state = dueState(date, status, now);
  const Icon = state === "done" ? CheckCircle2 : state === "overdue" ? TriangleAlert : state === "urgent" || state === "soon" ? AlarmClock : CalendarClock;
  const text =
    mode === "countdown"
      ? formatCountdown(date, now)
      : mode === "both"
        ? `${formatDue(date, tz, now)} · ${formatCountdown(date, now)}`
        : formatDue(date, tz, now);
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium tabular", DUE_TONE[state], className)}>
      <Icon className="size-3.5 shrink-0" />
      <span suppressHydrationWarning>{text}</span>
    </span>
  );
}

/** A pill version used on cards and the board. */
export function DuePill({ dueAt, status, tz }: { dueAt: string; status: string; tz: string }) {
  const now = useNow();
  const state = dueState(new Date(dueAt), status, now);
  const bg = {
    done: "bg-surface-sunken",
    overdue: "bg-danger-soft",
    urgent: "bg-danger-soft",
    soon: "bg-warning-soft",
    upcoming: "bg-surface-sunken",
  }[state];
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2", bg)}>
      <DueLabel dueAt={dueAt} status={status} tz={tz} className="text-[11.5px]" />
    </span>
  );
}
