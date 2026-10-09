"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { EASE, useMounted } from "./hud";

/**
 * Fourteen days of throughput: work finished (glowing cyan) against work
 * handed out (violet, dashed). Hover for the day's numbers.
 */
export function ThroughputChart({
  series,
}: {
  series: { key: string; completed: number; created: number }[];
}) {
  const W = 640;
  const H = 210;
  const pad = { l: 28, r: 12, t: 16, b: 26 };
  const max = Math.max(
    4,
    ...series.map((d) => Math.max(d.completed, d.created)),
  );
  const x = (i: number) =>
    pad.l + (i / (series.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const [hover, setHover] = React.useState<number | null>(null);
  const mounted = useMounted();

  // Smooth curve through the points (Catmull-Rom → Bézier).
  const curve = (vals: number[]) => {
    const pts = vals.map((v, i) => [x(i), y(v)] as const);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
    }
    return d;
  };

  const done = curve(series.map((d) => d.completed));
  const made = curve(series.map((d) => d.created));
  const area = `${done} L${x(series.length - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`;
  const totalDone = series.reduce((s, d) => s + d.completed, 0);
  const totalMade = series.reduce((s, d) => s + d.created, 0);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(
      ((px - pad.l) / (W - pad.l - pad.r)) * (series.length - 1),
    );
    setHover(i >= 0 && i < series.length ? i : null);
  };

  const label = (key: string) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[10.5px] tracking-wider text-[var(--mc-muted)]">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 rounded bg-[var(--mc-cyan)] shadow-[0_0_8px_rgba(103,232,249,0.8)]" />{" "}
          COMPLETED <b className="text-[var(--mc-text)]">{totalDone}</b>
        </span>
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-violet-400" />{" "}
          ASSIGNED <b className="text-[var(--mc-text)]">{totalMade}</b>
        </span>
        <span className="ml-auto text-[var(--mc-dim)]">LAST 14 DAYS</span>
      </div>
      {!mounted ? (
        <div className="aspect-[640/210] w-full" aria-hidden />
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="mc-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
            </linearGradient>
            <filter
              id="mc-line-glow"
              x="-10%"
              y="-50%"
              width="120%"
              height="200%"
            >
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {Array.from({ length: 5 }).map((_, i) => {
            const v = (max / 4) * i;
            return (
              <g key={i}>
                <line
                  x1={pad.l}
                  x2={W - pad.r}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="#5aa7f8"
                  strokeOpacity={i === 0 ? 0.25 : 0.08}
                />
                <text
                  x={pad.l - 8}
                  y={y(v)}
                  textAnchor="end"
                  dominantBaseline="central"
                  fill="#4c5f80"
                  fontSize="9"
                  fontFamily="var(--font-geist-mono)"
                >
                  {Math.round(v)}
                </text>
              </g>
            );
          })}
          {series.map((d, i) =>
            i % 2 === 0 ? (
              <text
                key={d.key}
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                fill="#4c5f80"
                fontSize="9"
                fontFamily="var(--font-geist-mono)"
              >
                {label(d.key).toUpperCase()}
              </text>
            ) : null,
          )}
          <motion.path
            d={area}
            fill="url(#mc-area)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 1 }}
          />
          <motion.path
            d={made}
            fill="none"
            stroke="#a78bfa"
            strokeWidth="1.5"
            strokeDasharray="4 5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.9 }}
            transition={{ duration: 1, delay: 0.9 }}
          />
          <motion.path
            d={done}
            fill="none"
            stroke="#67e8f9"
            strokeWidth="2.5"
            strokeLinecap="round"
            filter="url(#mc-line-glow)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.8, ease: EASE, delay: 0.5 }}
          />
          {series.map((d, i) => (
            <motion.circle
              key={d.key}
              cx={x(i)}
              cy={y(d.completed)}
              r={hover === i ? 5 : 2.5}
              fill="#030814"
              stroke="#67e8f9"
              strokeWidth="1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 + i * 0.08 }}
            />
          ))}
          <AnimatePresence>
            {hover !== null && (
              <motion.g
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={pad.t}
                  y2={H - pad.b}
                  stroke="#67e8f9"
                  strokeOpacity="0.4"
                  strokeDasharray="2 3"
                />
                <g
                  transform={`translate(${Math.min(Math.max(x(hover) - 62, pad.l), W - pad.r - 124)} ${pad.t})`}
                >
                  <rect
                    width="124"
                    height="46"
                    rx="8"
                    fill="#06101f"
                    stroke="#5aa7f8"
                    strokeOpacity="0.35"
                  />
                  <text
                    x="10"
                    y="16"
                    fill="#7f93b5"
                    fontSize="9"
                    fontFamily="var(--font-geist-mono)"
                  >
                    {label(series[hover].key).toUpperCase()}
                  </text>
                  <text
                    x="10"
                    y="31"
                    fill="#67e8f9"
                    fontSize="10.5"
                    fontFamily="var(--font-geist-mono)"
                  >
                    DONE {series[hover].completed}
                  </text>
                  <text
                    x="66"
                    y="31"
                    fill="#a78bfa"
                    fontSize="10.5"
                    fontFamily="var(--font-geist-mono)"
                  >
                    NEW {series[hover].created}
                  </text>
                </g>
              </motion.g>
            )}
          </AnimatePresence>
        </svg>
      )}
    </div>
  );
}
