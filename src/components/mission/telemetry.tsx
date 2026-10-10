"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { dayKey, formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { EASE, Telemetry, useMounted } from "./hud";

export interface StreamEntry {
  id: string;
  kind: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  actor: { firstName: string; lastName: string };
  task: { id: string; number: number };
}

const STATUS_WORD: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", BLOCKED: "Blocked", DONE: "Done" };
const STATUS_TONE: Record<string, BadgeTone> = { DONE: "success", BLOCKED: "danger", IN_REVIEW: "info", IN_PROGRESS: "brand", TODO: "neutral" };

/** Tag colours follow the brand's status meanings: success only for done, info for reviews and requests. */
function tagOf(e: StreamEntry): { label: string; tone: BadgeTone } {
  switch (e.kind) {
    case "PROGRESS_UPDATE":
      return { label: "Update", tone: "brand" };
    case "STATUS_CHANGED": {
      const to = String(e.meta?.to ?? "");
      return { label: to === "DONE" ? "Done" : "Status", tone: STATUS_TONE[to] ?? "neutral" };
    }
    case "CREATED":
      return { label: "New", tone: "brand" };
    case "UPDATE_REQUESTED":
      return { label: "Asked", tone: "info" };
    case "ATTACHMENT_ADDED":
      return { label: "File", tone: "neutral" };
    case "COMMENT":
      return { label: "Comment", tone: "neutral" };
    default:
      return { label: "Event", tone: "neutral" };
  }
}

function describe(e: StreamEntry) {
  const m = e.meta ?? {};
  switch (e.kind) {
    case "PROGRESS_UPDATE":
      return `${String(m.progress ?? 0)}%${e.body ? ` — ${e.body}` : ""}`;
    case "STATUS_CHANGED":
      return `${STATUS_WORD[String(m.from)] ?? m.from} → ${STATUS_WORD[String(m.to)] ?? m.to}`;
    case "COMMENT":
      return e.body ?? "";
    case "CREATED":
      return "assigned";
    case "UPDATE_REQUESTED":
      return e.body ? `asked for an update — ${e.body}` : "asked for an update";
    case "ATTACHMENT_ADDED":
      return `attached ${String(m.title ?? "a file")}`;
    default:
      return "";
  }
}

/** The team's latest activity, newest first, grouped by day in the viewer's time zone. */
export function ActivityLog({ entries, tz, reference }: { entries: StreamEntry[]; tz: string; reference: string }) {
  if (entries.length === 0) return <p className="py-10 text-center text-[13px] text-fg-subtle">Nothing has happened yet today.</p>;

  // Day labels are computed from the server's snapshot time, so server and browser agree.
  const ref = new Date(reference);
  const today = dayKey(ref, tz);
  const yesterday = dayKey(new Date(ref.getTime() - 86_400_000), tz);
  const dayLabel = (key: string, d: Date) => (key === today ? "Today" : key === yesterday ? "Yesterday" : formatDate(d, tz, { weekday: true }));
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  const rows = entries.map((e, i) => {
    const at = new Date(e.createdAt);
    const key = dayKey(at, tz);
    const prev = entries[i - 1];
    return { e, at, header: !prev || dayKey(new Date(prev.createdAt), tz) !== key ? dayLabel(key, at) : null };
  });

  return (
    <div className="relative">
      <ul className="max-h-[360px] overflow-hidden">
        {rows.map(({ e, at, header }, i) => {
          const tag = tagOf(e);
          return (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.4 + i * 0.05 }}
            >
              {header && (
                <div className={cn("px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle", i > 0 && "mt-3 border-t border-line pt-3")}>
                  {header}
                </div>
              )}
              <Link href={`/tasks/${e.task.id}`} className="group flex items-start gap-2.5 rounded-lg px-1 py-1 text-[12.5px] transition-colors hover:bg-surface-hover">
                <span className="mt-[3px] w-10 shrink-0 font-mono text-[11px] text-fg-subtle">{time.format(at)}</span>
                <Badge tone={tag.tone} className="h-5 w-[68px] justify-center px-2 text-[10.5px] font-semibold">
                  {tag.label}
                </Badge>
                <span className="line-clamp-2 min-w-0 text-fg-muted">
                  <span className="font-medium text-fg">
                    {e.actor.firstName} {e.actor.lastName[0] ?? ""}.
                  </span>{" "}
                  <span className="font-mono text-[11px] text-fg-subtle group-hover:text-brand">T-{e.task.number}</span> {describe(e)}
                </span>
              </Link>
            </motion.li>
          );
        })}
      </ul>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />
    </div>
  );
}

/** Half-ring gauge for the on-time rate. */
export function OnTimeGauge({ value, sample }: { value: number | null; sample: number }) {
  const r = 70;
  const c = Math.PI * r;
  const pct = value ?? 0;
  const tone = value === null ? "var(--fg-subtle)" : pct >= 85 ? "var(--success)" : pct >= 65 ? "var(--warning)" : "var(--danger)";
  const text = value === null ? "text-fg-subtle" : pct >= 85 ? "text-success" : pct >= 65 ? "text-warning" : "text-danger";
  const mounted = useMounted();
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col items-center">
      {mounted ? (
        <svg viewBox="0 0 180 100" className="w-full max-w-[220px]" role="img" aria-label={value === null ? "On-time rate: no tasks closed yet" : `On time: ${pct}%`}>
          <path d={`M20 92 A${r} ${r} 0 0 1 160 92`} fill="none" style={{ stroke: "var(--surface-sunken)" }} strokeWidth="12" strokeLinecap="round" />
          {Array.from({ length: 11 }).map((_, i) => {
            const a = Math.PI - (i / 10) * Math.PI;
            return (
              <line
                key={i}
                x1={90 + 82 * Math.cos(a)}
                y1={92 - 82 * Math.sin(a)}
                x2={90 + 88 * Math.cos(a)}
                y2={92 - 88 * Math.sin(a)}
                style={{ stroke: "var(--line-strong)" }}
                strokeWidth={i % 5 === 0 ? 1.5 : 1}
              />
            );
          })}
          <motion.path
            d={`M20 92 A${r} ${r} 0 0 1 160 92`}
            fill="none"
            style={{ stroke: tone }}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={reduce ? false : { strokeDashoffset: c }}
            animate={{ strokeDashoffset: c - (pct / 100) * c }}
            transition={{ duration: 1.2, ease: EASE, delay: 0.4 }}
          />
        </svg>
      ) : (
        <div className="aspect-[180/100] w-full max-w-[220px]" aria-hidden />
      )}
      <div className="-mt-10 text-center">
        <div className={cn("text-[30px] font-semibold leading-none tracking-[-0.03em]", text)}>{value === null ? "—" : <Telemetry value={pct} suffix="%" />}</div>
        <div className="mt-4 text-xs text-fg-subtle">
          {value === null ? "No tasks closed in the last 30 days" : `Finished on time · last 30 days · ${sample} closed`}
        </div>
      </div>
    </div>
  );
}

/** Per-person open work as segmented bars: red is overdue, amber due within a day. */
export function Workload({
  crew,
}: {
  crew: { id: string; firstName: string; lastName: string; open: number; overdue: number; soon: number; status: string }[];
}) {
  const rows = crew.filter((c) => c.open > 0).sort((a, b) => b.overdue - a.overdue || b.open - a.open).slice(0, 9);
  const SEGMENTS = 12;
  const max = Math.max(SEGMENTS / 2, ...rows.map((r) => r.open));
  if (rows.length === 0) return <p className="py-8 text-center text-[13px] text-fg-subtle">No one has open work right now.</p>;
  return (
    <div>
      <div className="mb-3.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-fg-muted">
        {[
          ["bg-brand", "Open"],
          ["bg-warning", "Due within a day"],
          ["bg-danger", "Overdue"],
        ].map(([dot, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-[3px]", dot)} />
            {label}
          </span>
        ))}
      </div>
      <ul className="space-y-2.5">
        {rows.map((r, ri) => {
          const filled = Math.max(1, Math.round((r.open / max) * SEGMENTS));
          const late = Math.round((r.overdue / max) * SEGMENTS);
          const soon = Math.round((r.soon / max) * SEGMENTS);
          return (
            <li key={r.id}>
              <Link
                href={`/people/${r.id}`}
                className="group flex items-center gap-3"
                aria-label={`${r.firstName} ${r.lastName}: ${r.open} open, ${r.soon} due within a day, ${r.overdue} overdue`}
              >
                <span className="w-[92px] shrink-0 truncate text-[12.5px] font-medium text-fg-muted group-hover:text-brand">
                  {r.firstName} {r.lastName[0] ?? ""}.
                </span>
                <span className="flex flex-1 gap-[3px]" aria-hidden>
                  {Array.from({ length: SEGMENTS }).map((_, i) => {
                    const on = i < filled;
                    const color = i < late ? "bg-danger" : i < late + soon ? "bg-warning" : "bg-brand";
                    return (
                      <motion.span
                        key={i}
                        className={cn("h-2.5 flex-1 rounded-[3px]", on ? color : "bg-surface-sunken")}
                        initial={{ opacity: 0, scaleY: 0.3 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        transition={{ duration: 0.25, ease: EASE, delay: 0.4 + ri * 0.05 + i * 0.02 }}
                      />
                    );
                  })}
                </span>
                <span className="w-6 text-right text-[12.5px] font-semibold text-fg tabular">{r.open}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Open work by stage as one segmented bar. */
export function StatusMatrix({ status }: { status: Record<"TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED", number> }) {
  const parts = [
    { key: "TODO", label: "To do", bar: "bg-fg-subtle", text: "text-fg", value: status.TODO },
    { key: "IN_PROGRESS", label: "In progress", bar: "bg-brand", text: "text-brand", value: status.IN_PROGRESS },
    { key: "IN_REVIEW", label: "In review", bar: "bg-info", text: "text-info", value: status.IN_REVIEW },
    { key: "BLOCKED", label: "Blocked", bar: "bg-danger", text: "text-danger", value: status.BLOCKED },
  ];
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="@container">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">Open work by stage</div>
      <div
        className="mt-2 flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={parts.map((p) => `${p.value} ${p.label.toLowerCase()}`).join(", ")}
      >
        {total > 0 &&
          parts.map((p, i) =>
            p.value ? (
              <span key={p.key} className="h-full" style={{ flexGrow: p.value, flexBasis: 0 }}>
                <motion.span
                  className={cn("block h-full w-full origin-left", p.bar)}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.9, ease: EASE, delay: 0.4 + i * 0.1 }}
                />
              </span>
            ) : null,
          )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 @xs:grid-cols-4">
        {parts.map((p) => (
          <div key={p.key} className="min-w-0">
            <div className={cn("text-[20px] font-semibold leading-none tracking-[-0.02em]", p.value ? p.text : "text-fg-subtle")}>
              <Telemetry value={p.value} />
            </div>
            <div className="mt-1 whitespace-nowrap text-[11px] text-fg-subtle">{p.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
