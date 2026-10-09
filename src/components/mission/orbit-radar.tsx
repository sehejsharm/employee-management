"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { EASE, useMounted } from "./hud";

export interface CrewMember {
  id: string;
  firstName: string;
  lastName: string;
  avatarHue: number;
  title: string | null;
  role: string;
  status: string;
  focus: string | null;
  department: { name: string; color: string } | null;
  open: number;
  overdue: number;
  soon: number;
}

const RINGS = [
  { roles: ["FOUNDER"], r: 96, spin: 70, label: "COMMAND" },
  { roles: ["MANAGER"], r: 168, spin: 95, label: "LEADS" },
  { roles: ["EMPLOYEE", "INTERN"], r: 240, spin: 130, label: "CREW" },
];

function health(c: CrewMember) {
  if (c.overdue > 0) return { color: "#f87171", label: "OVERDUE", tone: "text-[var(--mc-red)]" };
  if (c.soon > 0) return { color: "#fbbf24", label: "DUE < 48H", tone: "text-[var(--mc-amber)]" };
  if (c.open > 0) return { color: "#5aa7f8", label: "ON TRACK", tone: "text-[var(--mc-blue)]" };
  return { color: "#64748b", label: "STANDBY", tone: "text-[var(--mc-muted)]" };
}

/**
 * The crew as satellites. Founders orbit closest to HQ, leads in the middle,
 * everyone else on the outer ring. Colour is deadline health; size is load.
 */
export function OrbitRadar({ crew }: { crew: CrewMember[] }) {
  const router = useRouter();
  const [active, setActive] = React.useState<CrewMember | null>(null);
  const anomalies = crew.filter((c) => c.overdue > 0).length;
  const mounted = useMounted();

  const rings = RINGS.map((ring, ri) => {
    const members = crew.filter((c) => ring.roles.includes(c.role));
    return {
      ...ring,
      members: members.map((m, i) => {
        const angle = (i / Math.max(members.length, 1)) * Math.PI * 2 + ri * 0.7 - Math.PI / 2;
        return { m, x: 300 + ring.r * Math.cos(angle), y: 300 + ring.r * Math.sin(angle) };
      }),
    };
  });

  if (!mounted) return <div className="mx-auto aspect-square w-full max-w-[560px]" aria-hidden />;

  return (
    <div className="relative">
      <svg viewBox="0 0 600 600" className="mx-auto block w-full max-w-[560px]" role="img" aria-label="Team radar">
        <defs>
          <radialGradient id="mc-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a6ae0" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#0b1f45" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#030814" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mc-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.32" />
          </linearGradient>
          <filter id="mc-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="300" cy="300" r="290" fill="url(#mc-core)" />

        {/* Range rings and crosshair */}
        {[48, 96, 132, 168, 204, 240, 276].map((r, i) => (
          <motion.circle
            key={r}
            cx="300"
            cy="300"
            r={r}
            fill="none"
            stroke="#5aa7f8"
            strokeOpacity={i % 2 ? 0.08 : 0.2}
            strokeDasharray={i % 2 ? "2 6" : undefined}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1.4, ease: EASE, delay: 0.1 + i * 0.07 }}
          />
        ))}
        <g stroke="#5aa7f8" strokeOpacity="0.12">
          <line x1="300" y1="14" x2="300" y2="586" />
          <line x1="14" y1="300" x2="586" y2="300" />
          <line x1="98" y1="98" x2="502" y2="502" strokeOpacity="0.06" />
          <line x1="502" y1="98" x2="98" y2="502" strokeOpacity="0.06" />
        </g>

        {/* Bezel ticks, slowly turning */}
        <g className="mc-spin" style={{ ["--mc-spin" as string]: "240s" }}>
          {Array.from({ length: 72 }).map((_, i) => {
            const a = (i / 72) * Math.PI * 2;
            const long = i % 6 === 0;
            const r1 = long ? 280 : 284;
            return (
              <line
                key={i}
                x1={300 + r1 * Math.cos(a)}
                y1={300 + r1 * Math.sin(a)}
                x2={300 + 290 * Math.cos(a)}
                y2={300 + 290 * Math.sin(a)}
                stroke="#67e8f9"
                strokeOpacity={long ? 0.55 : 0.2}
                strokeWidth={long ? 1.5 : 1}
              />
            );
          })}
        </g>

        {/* Sonar pings */}
        <circle className="mc-ping" cx="300" cy="300" r="276" fill="none" stroke="#67e8f9" strokeWidth="1.5" />
        <circle className="mc-ping mc-ping--late" cx="300" cy="300" r="276" fill="none" stroke="#5aa7f8" strokeWidth="1" />

        {/* Radar sweep */}
        <g className="mc-sweep">
          <path d="M300 300 L300 24 A276 276 0 0 1 458.3 73.9 Z" fill="url(#mc-sweep)" />
          <line x1="300" y1="300" x2="458.3" y2="73.9" stroke="#67e8f9" strokeOpacity="0.85" strokeWidth="1.5" filter="url(#mc-glow)" />
        </g>

        {/* Ring labels */}
        {rings.map((ring) =>
          ring.members.length ? (
            <text key={ring.label} x={304} y={300 - ring.r - 6} fill="#4c5f80" fontSize="9" fontFamily="var(--font-geist-mono)" letterSpacing="2">
              {ring.label}
            </text>
          ) : null,
        )}

        {/* Satellites */}
        {rings.map((ring, ri) => (
          <g key={ring.label} className={`mc-spin ${ri % 2 ? "mc-spin--rev" : ""}`} style={{ ["--mc-spin" as string]: `${ring.spin}s` }}>
            {ring.members.map(({ m, x, y }, i) => {
              const h = health(m);
              const size = 11 + Math.min(m.open, 6) * 1.6;
              const isActive = active?.id === m.id;
              return (
                <g key={m.id} transform={`translate(${x} ${y})`}>
                  <motion.g
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.5 + ri * 0.2 + i * 0.05 }}
                  >
                    <g
                      className={`mc-counter ${ri % 2 ? "mc-counter--rev" : ""}`}
                      onMouseEnter={() => setActive(m)}
                      onMouseLeave={() => setActive((a) => (a?.id === m.id ? null : a))}
                      onClick={() => router.push(`/people/${m.id}`)}
                      style={{ cursor: "pointer" }}
                    >
                      {m.overdue > 0 && <circle className="mc-alarm" r={size} fill="none" stroke={h.color} strokeWidth="1.5" />}
                      <circle r={size + 7} fill={h.color} opacity={isActive ? 0.32 : 0.14} />
                      <circle r={size} fill="#0a1730" stroke={h.color} strokeWidth={isActive ? 2.5 : 1.75} filter="url(#mc-glow)" />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#e6f0ff"
                        fontSize={size * 0.72}
                        fontWeight="600"
                        fontFamily="var(--font-geist-sans)"
                      >
                        {m.firstName[0]}
                        {m.lastName[0] ?? ""}
                      </text>
                      {m.open > 0 && (
                        <g transform={`translate(${size * 0.78} ${-size * 0.78})`}>
                          <circle r="7" fill={h.color} />
                          <text textAnchor="middle" dominantBaseline="central" fill="#030814" fontSize="8.5" fontWeight="700" fontFamily="var(--font-geist-mono)">
                            {m.open}
                          </text>
                        </g>
                      )}
                    </g>
                  </motion.g>
                </g>
              );
            })}
          </g>
        ))}

        {/* HQ */}
        <circle cx="300" cy="300" r="44" fill="none" stroke="#67e8f9" strokeOpacity="0.35" className="mc-pulse" />
        <circle cx="300" cy="300" r="34" fill="#071226" stroke="#5aa7f8" strokeOpacity="0.6" strokeWidth="1.5" />
        <g transform="translate(278 278) scale(0.69)">
          <g fill="#7cc0fa">
            <rect x="12" y="8" width="5" height="48" />
            <rect x="12" y="8" width="29" height="5" />
            <rect x="12" y="27.5" width="18" height="5" />
          </g>
          <g fill="#3b8ef5">
            <path fillRule="evenodd" d="M26 56 V27.5 H40.5 A10 10 0 0 1 40.5 47.5 H31 V56 Z M31 32.5 V42.5 H40.5 A5 5 0 0 0 40.5 32.5 Z" />
            <path d="M35 47.5 H41 L52 56 H45.2 Z" />
          </g>
        </g>
      </svg>

      {/* Readout for the satellite under the cursor */}
      <div className="pointer-events-none mt-2 min-h-[92px] w-full max-w-[320px]">
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="rounded-xl border border-[var(--mc-line-strong)] bg-[#06101f]/90 p-3 backdrop-blur"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-semibold">
                  {active.firstName} {active.lastName}
                </span>
                <span className={`font-mono text-[9.5px] font-semibold tracking-widest ${health(active).tone}`}>{health(active).label}</span>
              </div>
              <div className="truncate text-[11px] text-[var(--mc-muted)]">
                {active.title}
                {active.department && ` · ${active.department.name}`}
              </div>
              <div className="mt-2 flex gap-3 font-mono text-[10.5px] tracking-wider text-[var(--mc-muted)]">
                <span>
                  OPEN <b className="text-[var(--mc-text)]">{active.open}</b>
                </span>
                <span>
                  {"<48H"} <b className="text-[var(--mc-amber)]">{active.soon}</b>
                </span>
                <span>
                  LATE <b className="text-[var(--mc-red)]">{active.overdue}</b>
                </span>
              </div>
              {active.focus && <div className="mt-1.5 line-clamp-2 text-[11px] text-[var(--mc-cyan)]/80">◎ {active.focus}</div>}
            </motion.div>
          ) : (
            <motion.div key="legend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[10px] tracking-wider text-[var(--mc-muted)]">
              {[
                ["#5aa7f8", "ON TRACK"],
                ["#fbbf24", "DUE < 48H"],
                ["#f87171", "OVERDUE"],
                ["#64748b", "STANDBY"],
              ].map(([c, l]) => (
                <div key={l} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
                  {l}
                </div>
              ))}
              <div className="col-span-2 pt-1 text-[var(--mc-dim)]">HOVER A SATELLITE · CLICK TO OPEN</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="pointer-events-none absolute right-0 top-0 text-right font-mono text-[10px] tracking-widest text-[var(--mc-muted)]">
        <div>
          CREW <span className="text-[var(--mc-text)]">{crew.length}</span>
        </div>
        <div className={anomalies ? "text-[var(--mc-red)]" : "text-[var(--mc-green)]"}>
          {anomalies ? `${anomalies} ANOMAL${anomalies === 1 ? "Y" : "IES"}` : "NO ANOMALIES"}
        </div>
      </div>
    </div>
  );
}
