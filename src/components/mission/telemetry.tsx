"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
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

const TAG: Record<string, { label: string; className: string }> = {
  PROGRESS_UPDATE: { label: "UPDATE", className: "text-[var(--mc-green)]" },
  STATUS_CHANGED: { label: "STATUS", className: "text-[var(--mc-cyan)]" },
  COMMENT: { label: "COMMS ", className: "text-[var(--mc-blue)]" },
  CREATED: { label: "LAUNCH", className: "text-violet-300" },
  UPDATE_REQUESTED: { label: "PING  ", className: "text-[var(--mc-amber)]" },
  ATTACHMENT_ADDED: { label: "CARGO ", className: "text-[var(--mc-muted)]" },
};

const STATUS_WORD: Record<string, string> = { TODO: "TODO", IN_PROGRESS: "IN-PROGRESS", IN_REVIEW: "REVIEW", BLOCKED: "BLOCKED", DONE: "DONE ✓" };

function describe(e: StreamEntry) {
  const m = e.meta ?? {};
  switch (e.kind) {
    case "PROGRESS_UPDATE":
      return `▸ ${String(m.progress ?? 0)}%${e.body ? ` "${e.body.slice(0, 70)}${e.body.length > 70 ? "…" : ""}"` : ""}`;
    case "STATUS_CHANGED":
      return `${STATUS_WORD[String(m.from)] ?? m.from} → ${STATUS_WORD[String(m.to)] ?? m.to}`;
    case "COMMENT":
      return `"${(e.body ?? "").slice(0, 80)}${(e.body ?? "").length > 80 ? "…" : ""}"`;
    case "CREATED":
      return "mission created";
    case "UPDATE_REQUESTED":
      return e.body ? `requested status: "${e.body.slice(0, 60)}"` : "requested status";
    case "ATTACHMENT_ADDED":
      return `attached ${String(m.title ?? "file")}`;
    default:
      return "";
  }
}

/** The team's activity as a mission log, newest first, typed in line by line. */
export function TelemetryStream({ entries, tz }: { entries: StreamEntry[]; tz: string }) {
  return (
    <div className="relative h-full min-h-[260px] font-mono text-[11.5px] leading-relaxed">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-[#081226] to-transparent" />
      <ul className="max-h-[330px] space-y-1 overflow-hidden">
        <AnimatePresence initial>
          {entries.map((e, i) => {
            const tag = TAG[e.kind] ?? { label: "EVENT ", className: "text-[var(--mc-muted)]" };
            const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(e.createdAt));
            return (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, x: -10, filter: "blur(4px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.7 + i * 0.09 }}
                className="truncate"
              >
                <Link href={`/tasks/${e.task.id}`} className="hover:text-white">
                  <span className="text-[var(--mc-dim)]">[{time}]</span> <span className={cn("font-semibold", tag.className)}>{tag.label}</span>{" "}
                  <span className="text-[var(--mc-text)]">
                    {e.actor.firstName.toUpperCase()}.{(e.actor.lastName[0] ?? "").toUpperCase()}
                  </span>{" "}
                  <span className="text-[var(--mc-dim)]">T-{e.task.number}</span> <span className="text-[var(--mc-muted)]">{describe(e)}</span>
                </Link>
              </motion.li>
            );
          })}
        </AnimatePresence>
        <li className="mc-cursor text-[var(--mc-dim)]">listening</li>
      </ul>
    </div>
  );
}

/** Semicircular gauge for the on-time rate. */
export function SuccessGauge({ value, sample }: { value: number | null; sample: number }) {
  const r = 70;
  const c = Math.PI * r;
  const pct = value ?? 0;
  const color = value === null ? "#4c5f80" : pct >= 85 ? "#34d399" : pct >= 65 ? "#fbbf24" : "#f87171";
  const mounted = useMounted();
  if (!mounted) return <div className="mx-auto aspect-[180/100] w-full max-w-[220px]" aria-hidden />;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 180 100" className="w-full max-w-[220px]">
        <defs>
          <filter id="mc-gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d={`M20 92 A${r} ${r} 0 0 1 160 92`} fill="none" stroke="rgba(90,167,248,0.12)" strokeWidth="12" strokeLinecap="round" />
        {Array.from({ length: 11 }).map((_, i) => {
          const a = Math.PI - (i / 10) * Math.PI;
          return (
            <line
              key={i}
              x1={90 + 82 * Math.cos(a)}
              y1={92 - 82 * Math.sin(a)}
              x2={90 + 88 * Math.cos(a)}
              y2={92 - 88 * Math.sin(a)}
              stroke="#5aa7f8"
              strokeOpacity={i % 5 === 0 ? 0.6 : 0.25}
            />
          );
        })}
        <motion.path
          d={`M20 92 A${r} ${r} 0 0 1 160 92`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (pct / 100) * c }}
          transition={{ duration: 1.8, ease: EASE, delay: 0.6 }}
          filter="url(#mc-gauge-glow)"
        />
      </svg>
      <div className="-mt-10 text-center">
        <div className="text-[30px] font-semibold leading-none" style={{ color, textShadow: `0 0 20px ${color}66` }}>
          {value === null ? "—" : <Telemetry value={pct} suffix="%" />}
        </div>
        <div className="mt-4 font-mono text-[9.5px] tracking-[0.2em] text-[var(--mc-muted)]">ON-TIME · 30D · {sample} CLOSED</div>
      </div>
    </div>
  );
}

/** Per-person load as segmented fuel gauges. */
export function CrewLoad({
  crew,
}: {
  crew: { id: string; firstName: string; lastName: string; open: number; overdue: number; soon: number; status: string }[];
}) {
  const rows = crew.filter((c) => c.open > 0).sort((a, b) => b.overdue - a.overdue || b.open - a.open).slice(0, 9);
  const SEGMENTS = 12;
  const max = Math.max(SEGMENTS / 2, ...rows.map((r) => r.open));
  if (rows.length === 0) return <p className="py-8 text-center font-mono text-[11px] tracking-widest text-[var(--mc-muted)]">ALL CREW ON STANDBY</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, ri) => {
        const filled = Math.max(1, Math.round((r.open / max) * SEGMENTS));
        const late = Math.round((r.overdue / max) * SEGMENTS);
        const soon = Math.round((r.soon / max) * SEGMENTS);
        return (
          <li key={r.id}>
            <Link href={`/people/${r.id}`} className="group flex items-center gap-3">
              <span className="w-[92px] shrink-0 truncate font-mono text-[10.5px] tracking-wider text-[var(--mc-muted)] group-hover:text-white">
                {r.firstName.toUpperCase()} {(r.lastName[0] ?? "").toUpperCase()}.
              </span>
              <span className="flex flex-1 gap-[3px]">
                {Array.from({ length: SEGMENTS }).map((_, i) => {
                  const on = i < filled;
                  const color = i < late ? "#f87171" : i < late + soon ? "#fbbf24" : "#5aa7f8";
                  return (
                    <motion.span
                      key={i}
                      className="h-2.5 flex-1 rounded-[2px]"
                      initial={{ opacity: 0, scaleY: 0.2 }}
                      animate={{ opacity: on ? 1 : 0.12, scaleY: 1 }}
                      transition={{ duration: 0.25, delay: 0.7 + ri * 0.05 + i * 0.025 }}
                      style={{ background: on ? color : "#5aa7f8", boxShadow: on ? `0 0 6px ${color}88` : undefined }}
                    />
                  );
                })}
              </span>
              <span className="w-6 text-right font-mono text-[11px] font-semibold text-[var(--mc-text)]">{r.open}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Open work by stage as one segmented bar. */
export function StatusMatrix({ status }: { status: Record<"TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED", number> }) {
  const parts = [
    { key: "TODO", label: "QUEUED", color: "#64748b", value: status.TODO },
    { key: "IN_PROGRESS", label: "IN FLIGHT", color: "#5aa7f8", value: status.IN_PROGRESS },
    { key: "IN_REVIEW", label: "REVIEW", color: "#a78bfa", value: status.IN_REVIEW },
    { key: "BLOCKED", label: "BLOCKED", color: "#f87171", value: status.BLOCKED },
  ];
  const total = Math.max(1, parts.reduce((s, p) => s + p.value, 0));
  return (
    <div>
      <div className="flex h-3 gap-[3px] overflow-hidden rounded-full">
        {parts.map((p, i) =>
          p.value ? (
            <motion.div
              key={p.key}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ background: p.color, boxShadow: `0 0 10px ${p.color}66` }}
              initial={{ width: 0 }}
              animate={{ width: `${(p.value / total) * 100}%` }}
              transition={{ duration: 1.1, ease: EASE, delay: 0.6 + i * 0.1 }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {parts.map((p) => (
          <div key={p.key}>
            <div className="text-[20px] font-semibold leading-none" style={{ color: p.color }}>
              <Telemetry value={p.value} />
            </div>
            <div className="mt-1 font-mono text-[9px] tracking-[0.18em] text-[var(--mc-muted)]">{p.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
