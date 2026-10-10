"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Pencil, Target } from "lucide-react";
import { toast } from "sonner";
import { CountUp } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { setFocus } from "@/actions/profile";
import { dueState, formatCountdown, formatDue } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useNow } from "@/components/tasks/badges";
import type { TaskStatusKey } from "@/components/tasks/meta";

const EASE = [0.16, 1, 0.3, 1] as const;

const TONES = {
  brand: { icon: "bg-brand-soft text-brand-soft-fg", glow: "from-brand/12" },
  warning: { icon: "bg-warning-soft text-warning", glow: "from-warning/12" },
  danger: { icon: "bg-danger-soft text-danger", glow: "from-danger/12" },
  success: { icon: "bg-success-soft text-success", glow: "from-success/12" },
} as const;

export function StatCard({
  label,
  value,
  icon,
  tone = "brand",
  hint,
  trend,
  href,
  index = 0,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: keyof typeof TONES;
  hint?: string;
  trend?: { delta: number; label: string };
  href?: string;
  index?: number;
}) {
  const t = TONES[tone];
  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.05 + index * 0.06 }}
      whileHover={{ y: -2 }}
      className="group relative h-full overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
    >
      <div className={cn("pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br to-transparent blur-2xl", t.glow)} />
      <div className="relative flex items-start justify-between gap-2">
        <span className="text-[12.5px] font-medium text-fg-muted">{label}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-[10px] [&_svg]:size-4", t.icon)}>{icon}</span>
      </div>
      <div className="relative mt-3 flex items-end gap-2">
        <CountUp value={value} className="text-[30px] font-semibold leading-none tracking-[-0.03em] tabular sm:text-[34px]" />
        {trend && trend.delta !== 0 && (
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
              trend.delta > 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {trend.delta > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(trend.delta)}
          </span>
        )}
      </div>
      {(hint || trend) && <div className="relative mt-1.5 text-xs text-fg-subtle">{trend?.label ?? hint}</div>}
    </motion.div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function FocusEditor({ initial }: { initial: string | null }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(initial ?? "");
  const [pending, start] = React.useTransition();

  const save = () =>
    start(async () => {
      const res = await setFocus(value);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setEditing(false);
    });

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/80 p-3 pl-4 shadow-xs backdrop-blur">
      <Target className="size-4 shrink-0 text-brand" />
      {editing ? (
        <>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="What are you focused on today?"
            maxLength={160}
            autoFocus
            className="h-8 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-subtle"
          />
          <Button size="xs" onClick={save} loading={pending}>
            Save
          </Button>
        </>
      ) : (
        <>
          <button onClick={() => setEditing(true)} className="min-w-0 flex-1 truncate text-left text-[13.5px]">
            {initial ? (
              <>
                <span className="text-fg-subtle">Focused on </span>
                <span className="font-medium">{initial}</span>
              </>
            ) : (
              <span className="text-fg-subtle">Share what you&apos;re focused on today — your team sees it on the org chart.</span>
            )}
          </button>
          <Button variant="ghost" size="icon-xs" onClick={() => setEditing(true)} aria-label="Edit focus">
            <Pencil />
          </Button>
        </>
      )}
    </div>
  );
}

/** The single most pressing deadline, front and centre, ticking. */
export function NextDeadline({
  task,
  tz,
}: {
  task: { id: string; number: number; title: string; dueAt: string; status: TaskStatusKey; progress: number } | null;
  tz: string;
}) {
  const now = useNow(1000 * 15);
  if (!task) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-success">All clear</div>
        <p className="mt-2 text-[20px] font-semibold tracking-tight">Nothing due. Enjoy the calm.</p>
        <p className="mt-1 text-[13.5px] text-fg-muted">New assignments will show up here the moment they land.</p>
      </div>
    );
  }
  const date = new Date(task.dueAt);
  const state = dueState(date, task.status, now);
  const urgent = state === "overdue" || state === "urgent";
  return (
    <Link href={`/tasks/${task.id}`} className="group block">
      <motion.div
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: EASE }}
        className={cn(
          "relative overflow-hidden rounded-2xl p-6 text-white shadow-lg transition-transform group-hover:-translate-y-0.5",
          urgent ? "bg-danger" : "bg-brand-gradient",
        )}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 rounded-full border border-white/10" />
        <motion.div
          className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-white/10 blur-3xl"
          animate={{ x: [0, 30, 0], opacity: [0.5, 0.9, 0.5] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-white/75">
            {urgent && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
            )}
            {state === "overdue" ? "Overdue" : "Next deadline"} · T-{task.number}
          </div>
          <p className="mt-3 line-clamp-2 text-[21px] font-semibold leading-snug tracking-[-0.015em] sm:text-[24px]">{task.title}</p>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[34px] font-semibold leading-none tracking-[-0.03em] tabular sm:text-[40px]" suppressHydrationWarning>
                {formatCountdown(date, now).replace(/^in /, "")}
              </div>
              <div className="mt-1.5 text-[13px] text-white/75" suppressHydrationWarning>
                {state === "overdue" ? "past the deadline · " : "left · "}
                {formatDue(date, tz, now)}
              </div>
            </div>
            <div className="w-40">
              <div className="flex justify-between text-[11.5px] text-white/75">
                <span>Progress</span>
                <span className="font-semibold text-white tabular">{task.progress}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
                <motion.div
                  className="h-full rounded-full bg-white"
                  initial={{ width: 0 }}
                  animate={{ width: `${task.progress}%` }}
                  transition={{ duration: 1, ease: EASE, delay: 0.3 }}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

export function WelcomeToast({ show }: { show: boolean }) {
  React.useEffect(() => {
    if (!show) return;
    toast.success("You're all set", { description: "Your password is saved. Welcome to the Focus Realm Workspace." });
    const url = new URL(window.location.href);
    url.searchParams.delete("welcome");
    window.history.replaceState(null, "", url.toString());
  }, [show]);
  return null;
}
