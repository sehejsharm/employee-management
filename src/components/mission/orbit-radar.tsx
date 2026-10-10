"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Target } from "lucide-react";
import { BrandMark } from "@/components/brand/logo";
import { useElementSize } from "@/lib/hooks";
import { cn } from "@/lib/utils";
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
  { roles: ["FOUNDER"], r: 96, spin: 70, label: "Founders" },
  { roles: ["MANAGER"], r: 168, spin: 95, label: "Leads" },
  { roles: ["EMPLOYEE", "INTERN"], r: 240, spin: 130, label: "Team" },
];

const SURFACE_HALO = { stroke: "var(--surface)", strokeWidth: 4, strokeLinejoin: "round" as const, paintOrder: "stroke" as const };

/** Deadline health, expressed only in brand and status tokens. */
export function health(c: Pick<CrewMember, "open" | "overdue" | "soon">) {
  if (c.overdue > 0) return { color: "var(--danger)", label: "Overdue work", text: "text-danger", dot: "bg-danger" };
  if (c.soon > 0) return { color: "var(--warning)", label: "Due within a day", text: "text-warning", dot: "bg-warning" };
  if (c.open > 0) return { color: "var(--brand)", label: "On track", text: "text-brand", dot: "bg-brand" };
  return { color: "var(--fg-subtle)", label: "No open tasks", text: "text-fg-subtle", dot: "bg-fg-subtle" };
}

/** The radar's one-line headline, shown in its panel header. */
export function RadarSummary({ crew }: { crew: CrewMember[] }) {
  const late = crew.filter((c) => c.overdue > 0).length;
  return (
    <div className="text-right text-[12px] leading-snug text-fg-muted">
      <div>
        <span className="font-semibold text-fg tabular">{crew.length}</span> people
      </div>
      <div className={cn("font-medium", late ? "text-danger" : "text-success")}>{late ? `${late} with overdue work` : "No one is overdue"}</div>
    </div>
  );
}

/**
 * The team as satellites around Focus Realm. Founders orbit closest, leads in
 * the middle, everyone else on the outer ring. Colour is deadline health;
 * size is how much open work they carry. Point at (or tab to, or tap) anyone
 * to read their load; click again to open their profile.
 */
export function OrbitRadar({ crew }: { crew: CrewMember[] }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const [active, setActive] = React.useState<CrewMember | null>(null);
  const [measure, { width }] = useElementSize<HTMLDivElement>();
  const lastPointer = React.useRef<string>("mouse");
  // Who was selected before this tap began (a tap focuses the satellite, which selects it, before the click lands).
  const selectedAtTap = React.useRef<string | null>(null);

  // The SVG scales with its box; `k` keeps labels and satellites legible on a phone.
  const k = width ? Math.min(2, Math.max(1, 600 / width)) : 1;

  const rings = RINGS.map((ring, ri) => {
    const members = crew.filter((c) => ring.roles.includes(c.role));
    return {
      ...ring,
      members: members.map((m, i) => {
        // Half a step off the vertical so nobody starts under the ring's label.
        const angle = ((i + 0.5) / Math.max(members.length, 1)) * Math.PI * 2 + ri * 0.35 - Math.PI / 2;
        return { m, x: 300 + ring.r * Math.cos(angle), y: 300 + ring.r * Math.sin(angle) };
      }),
    };
  });

  const open = (m: CrewMember) => router.push(`/people/${m.id}`);
  const onActivate = (m: CrewMember) => {
    // On touch there's no hover: the first tap shows the readout, the second opens the profile.
    if (lastPointer.current === "touch" && selectedAtTap.current !== m.id) setActive(m);
    else open(m);
  };

  return (
    <div className="mc-radar">
      <div ref={measure} className="relative mx-auto aspect-square w-full max-w-[540px]">
        {mounted && (
          <svg viewBox="0 0 600 600" className="absolute inset-0 h-full w-full overflow-visible" role="group" aria-label="Team radar: each person's deadline health">
            <defs>
              <radialGradient id="mc-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" style={{ stopColor: "var(--brand)", stopOpacity: 0.16 }} />
                <stop offset="70%" style={{ stopColor: "var(--brand)", stopOpacity: 0.04 }} />
                <stop offset="100%" style={{ stopColor: "var(--brand)", stopOpacity: 0 }} />
              </radialGradient>
              <linearGradient id="mc-sweep" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" style={{ stopColor: "var(--brand)", stopOpacity: 0 }} />
                <stop offset="100%" style={{ stopColor: "var(--brand)", stopOpacity: 0.2 }} />
              </linearGradient>
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
                style={{ stroke: "var(--brand)" }}
                strokeOpacity={i % 2 ? 0.12 : 0.24}
                strokeDasharray={i % 2 ? "2 6" : undefined}
                vectorEffect="non-scaling-stroke"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, ease: EASE, delay: 0.1 + i * 0.06 }}
              />
            ))}
            <g style={{ stroke: "var(--line-strong)" }} strokeOpacity="0.7">
              <line x1="300" y1="14" x2="300" y2="586" vectorEffect="non-scaling-stroke" />
              <line x1="14" y1="300" x2="586" y2="300" vectorEffect="non-scaling-stroke" />
            </g>

            {/* Bezel ticks, turning very slowly */}
            <g className="mc-spin" style={{ ["--mc-spin" as string]: "240s" }} aria-hidden>
              {Array.from({ length: 72 }).map((_, i) => {
                const a = (i / 72) * Math.PI * 2;
                const long = i % 6 === 0;
                const r1 = long ? 279 : 284;
                return (
                  <line
                    key={i}
                    x1={300 + r1 * Math.cos(a)}
                    y1={300 + r1 * Math.sin(a)}
                    x2={300 + 290 * Math.cos(a)}
                    y2={300 + 290 * Math.sin(a)}
                    style={{ stroke: "var(--color-brand-400)" }}
                    strokeOpacity={long ? 0.7 : 0.3}
                    strokeWidth={long ? 1.5 : 1}
                  />
                );
              })}
            </g>

            {/* Pings ripple out from Focus Realm; the sweep circles. Both say "live". */}
            <circle className="mc-ping" cx="300" cy="300" r="276" fill="none" style={{ stroke: "var(--brand)" }} strokeWidth="1.5" aria-hidden />
            <circle className="mc-ping mc-ping--late" cx="300" cy="300" r="276" fill="none" style={{ stroke: "var(--color-brand-400)" }} strokeWidth="1" aria-hidden />
            <g className="mc-sweep" aria-hidden>
              <path d="M300 300 L300 24 A276 276 0 0 1 458.3 73.9 Z" fill="url(#mc-sweep)" />
              <line x1="300" y1="300" x2="458.3" y2="73.9" style={{ stroke: "var(--brand)" }} strokeOpacity="0.6" strokeWidth="1.5" />
            </g>

            {/* Satellites */}
            {rings.map((ring, ri) => (
              <g key={ring.label} className={cn("mc-spin", ri % 2 && "mc-spin--rev")} style={{ ["--mc-spin" as string]: `${ring.spin}s` }}>
                {ring.members.map(({ m, x, y }, i) => {
                  const h = health(m);
                  const size = (12 + Math.min(m.open, 6) * 1.6) * Math.min(k, 1.6);
                  const isActive = active?.id === m.id;
                  const badge = 7.5 * k;
                  return (
                    <g key={m.id} transform={`translate(${x} ${y})`}>
                      <motion.g
                        initial={reduce ? false : { scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.6, ease: EASE, delay: 0.4 + ri * 0.15 + i * 0.04 }}
                      >
                        <g
                          className={cn("mc-counter outline-none", ri % 2 && "mc-counter--rev")}
                          role="link"
                          tabIndex={0}
                          aria-label={`${m.firstName} ${m.lastName}: ${m.open} open, ${m.soon} due within a day, ${m.overdue} overdue`}
                          onPointerDown={(e) => {
                            lastPointer.current = e.pointerType;
                            selectedAtTap.current = active?.id ?? null;
                          }}
                          onPointerEnter={(e) => e.pointerType === "mouse" && setActive(m)}
                          onPointerLeave={(e) => e.pointerType === "mouse" && setActive((a) => (a?.id === m.id ? null : a))}
                          onFocus={() => setActive(m)}
                          onBlur={() => setActive((a) => (a?.id === m.id ? null : a))}
                          onClick={() => onActivate(m)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              open(m);
                            }
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          {m.overdue > 0 && <circle className="mc-alarm" r={size} fill="none" style={{ stroke: h.color }} strokeWidth="1.5" />}
                          <circle r={size + 6 * k} style={{ fill: h.color }} opacity={isActive ? 0.3 : 0.12} />
                          <circle r={size} style={{ fill: "var(--surface)", stroke: h.color }} strokeWidth={isActive ? 3 * k : 2 * k} />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            style={{ fill: "var(--fg)", fontFamily: "var(--font-geist-sans)" }}
                            fontSize={size * 0.68}
                            fontWeight="600"
                          >
                            {m.firstName[0]}
                            {m.lastName[0] ?? ""}
                          </text>
                          {m.open > 0 && (
                            <g transform={`translate(${size * 0.8} ${-size * 0.8})`}>
                              <circle r={badge} style={{ fill: "var(--surface)", stroke: h.color }} strokeWidth={1.5 * k} />
                              <text
                                textAnchor="middle"
                                dominantBaseline="central"
                                style={{ fill: h.color, fontFamily: "var(--font-geist-sans)" }}
                                fontSize={badge * 1.1}
                                fontWeight="700"
                              >
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

            {/* Ring labels sit on top, haloed in the surface colour so they read over anyone passing beneath. */}
            <g pointerEvents="none">
              {rings.map((ring) =>
                ring.members.length ? (
                  <text
                    key={ring.label}
                    x={306}
                    y={300 - ring.r - 7 * k}
                    style={{ fill: "var(--fg-muted)", fontFamily: "var(--font-geist-sans)", ...SURFACE_HALO }}
                    fontSize={10 * k}
                    fontWeight="600"
                    letterSpacing={1.4 * k}
                  >
                    {ring.label.toUpperCase()}
                  </text>
                ) : null,
              )}
            </g>

            <circle className="mc-breathe" cx="300" cy="300" r="46" fill="none" style={{ stroke: "var(--brand)" }} strokeOpacity="0.5" aria-hidden />
          </svg>
        )}
        {/* Focus Realm at the centre — the real mark, not a redraw. */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.2 }}
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <BrandMark size={width && width < 380 ? 40 : 52} variant="tile" className="shadow-md" />
        </motion.div>
      </div>

      {/* Readout for whoever is pointed at, focused or tapped */}
      <div className="mt-3 min-h-[112px]" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {active ? (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="rounded-xl border border-line bg-surface-sunken/60 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13.5px] font-semibold">
                  {active.firstName} {active.lastName}
                </span>
                <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium", health(active).text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", health(active).dot)} />
                  {health(active).label}
                </span>
              </div>
              <div className="truncate text-xs text-fg-muted">
                {active.title}
                {active.department && ` · ${active.department.name}`}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
                <span>
                  <b className="font-semibold text-fg tabular">{active.open}</b> open
                </span>
                <span>
                  <b className={cn("font-semibold tabular", active.soon ? "text-warning" : "text-fg")}>{active.soon}</b> due within a day
                </span>
                <span>
                  <b className={cn("font-semibold tabular", active.overdue ? "text-danger" : "text-fg")}>{active.overdue}</b> overdue
                </span>
              </div>
              {active.focus && (
                <div className="mt-1.5 line-clamp-1 text-xs text-brand">
                  <Target className="mr-1 inline size-3" />
                  {active.focus}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="legend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-fg-muted">
                {[
                  ["bg-brand", "On track"],
                  ["bg-warning", "Due within a day"],
                  ["bg-danger", "Overdue work"],
                  ["bg-fg-subtle", "No open tasks"],
                ].map(([dot, label]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
                    {label}
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-[11.5px] text-fg-subtle">
                The number on each person is their open tasks. Point at or tap anyone to see their load; click to open their profile.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
