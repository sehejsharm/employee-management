"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useElementSize } from "@/lib/hooks";
import { EASE, useMounted } from "./hud";

type Point = readonly [number, number];

/**
 * A smooth line that never overshoots its data (monotone cubic, Fritsch–Carlson),
 * so a quiet day can't dip below zero between two busy ones.
 */
function monotonePath(pts: Point[]) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  const n = pts.length;
  const slope = pts.slice(0, -1).map((p, i) => (pts[i + 1][1] - p[1]) / (pts[i + 1][0] - p[0]));
  const tangent = pts.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    const a = slope[i - 1];
    const b = slope[i];
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = (x1 - x0) / 3;
    d += ` C${x0 + h},${y0 + tangent[i] * h} ${x1 - h},${y1 - tangent[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}

/**
 * Fourteen days of throughput: work finished (brand blue, filled) against
 * work handed out (dashed). Drawn at the size it's shown, so text stays crisp;
 * point at (or drag across) a day for its numbers.
 */
export function ThroughputChart({ series }: { series: { key: string; completed: number; created: number }[] }) {
  const [measure, size] = useElementSize<HTMLDivElement>();
  const mounted = useMounted();
  const reduce = useReducedMotion();
  const [hover, setHover] = React.useState<number | null>(null);

  const W = Math.round(size.width) || 640;
  const H = W < 480 ? 200 : 250;
  const pad = { l: 30, r: 14, t: 16, b: 28 };
  const plotW = W - pad.l - pad.r;
  const max = Math.max(4, ...series.map((d) => Math.max(d.completed, d.created)));
  const step = series.length > 1 ? plotW / (series.length - 1) : plotW;
  const x = (i: number) => pad.l + i * step;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  // Show as many day labels as fit without touching (each needs ~48px).
  const labelEvery = Math.max(1, Math.ceil(48 / step));

  const done = monotonePath(series.map((d, i) => [x(i), y(d.completed)] as const));
  const made = monotonePath(series.map((d, i) => [x(i), y(d.created)] as const));
  const area = `${done} L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const totalDone = series.reduce((s, d) => s + d.completed, 0);
  const totalMade = series.reduce((s, d) => s + d.created, 0);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round((px - pad.l) / step);
    setHover(Math.min(series.length - 1, Math.max(0, i)));
  };

  const label = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
  const axis = { fill: "var(--fg-subtle)", fontFamily: "var(--font-geist-sans)" };
  const tipW = 148;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-fg-muted">
        <span className="flex items-center gap-2">
          <span className="h-[3px] w-4 rounded-full bg-brand" /> Completed <b className="font-semibold text-fg tabular">{totalDone}</b>
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 border-t-2 border-dashed border-fg-subtle" /> Assigned <b className="font-semibold text-fg tabular">{totalMade}</b>
        </span>
      </div>
      <div ref={measure} className="w-full overflow-hidden" style={{ height: H }}>
        {mounted && size.width > 0 && (
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="block touch-pan-y"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label={`Last 14 days: ${totalDone} tasks completed, ${totalMade} assigned`}
          >
            <defs>
              <linearGradient id="mc-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--brand)", stopOpacity: 0.22 }} />
                <stop offset="100%" style={{ stopColor: "var(--brand)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {Array.from({ length: 5 }).map((_, i) => {
              const v = (max / 4) * i;
              return (
                <g key={i}>
                  <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} style={{ stroke: i === 0 ? "var(--line-strong)" : "var(--line)" }} />
                  <text x={pad.l - 8} y={y(v)} textAnchor="end" dominantBaseline="central" style={axis} fontSize="11">
                    {Math.round(v)}
                  </text>
                </g>
              );
            })}
            {series.map((d, i) =>
              (series.length - 1 - i) % labelEvery === 0 ? (
                <text key={d.key} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} style={axis} fontSize="11">
                  {label(d.key)}
                </text>
              ) : null,
            )}
            <motion.path
              d={area}
              fill="url(#mc-area)"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.6 }}
            />
            <motion.path
              d={made}
              fill="none"
              style={{ stroke: "var(--fg-subtle)" }}
              strokeWidth="1.5"
              strokeDasharray="4 5"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 0.9 }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.5 }}
            />
            <motion.path
              d={done}
              fill="none"
              style={{ stroke: "var(--brand)" }}
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: EASE, delay: 0.3 }}
            />
            {series.map((d, i) => (
              <motion.circle
                key={d.key}
                cx={x(i)}
                cy={y(d.completed)}
                r={hover === i ? 5 : 3}
                style={{ fill: "var(--surface)", stroke: "var(--brand)" }}
                strokeWidth="2"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.4 + i * 0.05 }}
              />
            ))}
            <AnimatePresence>
              {hover !== null && (
                <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} pointerEvents="none">
                  <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} style={{ stroke: "var(--brand)" }} strokeOpacity="0.35" strokeDasharray="2 3" />
                  <g transform={`translate(${Math.min(Math.max(x(hover) - tipW / 2, pad.l), W - pad.r - tipW)} ${pad.t})`}>
                    <rect width={tipW} height="50" rx="10" style={{ fill: "var(--surface-2)", stroke: "var(--line-strong)" }} />
                    <text x="12" y="18" style={{ ...axis, fill: "var(--fg-muted)" }} fontSize="11" fontWeight="600">
                      {label(series[hover].key)}
                    </text>
                    <text x="12" y="36" style={{ ...axis, fill: "var(--brand)" }} fontSize="12" fontWeight="600">
                      {series[hover].completed} done
                    </text>
                    <text x="70" y="36" style={{ ...axis, fill: "var(--fg-muted)" }} fontSize="12">
                      {series[hover].created} assigned
                    </text>
                  </g>
                </motion.g>
              )}
            </AnimatePresence>
          </svg>
        )}
      </div>
    </div>
  );
}
