"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowUpRight, MessageCircleQuestion, Plus } from "lucide-react";
import type { MissionData } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { EASE, FlipText, HudPanel, Telemetry, clock, tMinus, useTick } from "./hud";
import { OrbitRadar } from "./orbit-radar";
import { TMinusBoard } from "./t-minus";
import { ThroughputChart } from "./throughput-chart";
import { CrewLoad, StatusMatrix, SuccessGauge, TelemetryStream } from "./telemetry";
import "./mission.css";

const REFRESH_MS = 45_000;

/**
 * The founders' command screen: the whole company's work as live telemetry.
 * Clocks and countdowns tick every second; the data itself re-syncs every
 * 45 seconds while the screen is visible.
 */
export function MissionControl({ data, tz, scopeLabel }: { data: MissionData; tz: string; scopeLabel: string }) {
  const router = useRouter();
  const now = useTick(1000);
  const shell = React.useRef<HTMLDivElement>(null);
  const [synced, setSynced] = React.useState(() => new Date(data.generatedAt));

  React.useEffect(() => setSynced(new Date(data.generatedAt)), [data.generatedAt]);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);

  // The scan bar sweeps the panel's real height.
  React.useLayoutEffect(() => {
    const el = shell.current;
    if (!el) return;
    const ro = new ResizeObserver(() => el.style.setProperty("--mc-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const s = data.stats;
  const nominal = s.overdue === 0;
  const next = data.schedule.find((t) => now && new Date(t.dueAt) > now) ?? null;
  const nextT = next && now ? tMinus(new Date(next.dueAt), now) : null;
  const doneDelta = s.doneThisWeek - s.donePrevWeek;
  const sinceSync = now ? Math.max(0, Math.round((now.getTime() - synced.getTime()) / 1000)) : 0;

  return (
    <div
      ref={shell}
      className="mc relative -mx-4 overflow-hidden rounded-none border-y border-[#0f2140] sm:mx-0 sm:rounded-[28px] sm:border"
    >
      {/* Atmosphere */}
      <div className="mc-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(120%_80%_at_50%_0%,#000_40%,transparent)]" />
      <div className="mc-blob mc-blob--a pointer-events-none -left-32 -top-32 h-[420px] w-[420px] bg-[#1a6ae0]/30" />
      <div className="mc-blob mc-blob--b pointer-events-none -right-40 top-1/3 h-[480px] w-[480px] bg-[#0891b2]/20" />
      <div className="mc-scanlines pointer-events-none absolute inset-0 z-[1]" />
      <div className="mc-scanbar pointer-events-none z-[1]" />

      <div className="relative z-[2] p-3 sm:p-5 lg:p-6">
        {/* HUD header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="mb-4 flex flex-col gap-3 rounded-2xl border border-[var(--mc-line)] bg-white/[0.02] px-4 py-3 lg:flex-row lg:items-center"
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-70", nominal ? "bg-[var(--mc-green)]" : "bg-[var(--mc-red)]")} />
              <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", nominal ? "bg-[var(--mc-green)]" : "bg-[var(--mc-red)]")} />
            </span>
            <div>
              <div className="whitespace-nowrap font-mono text-[11px] font-semibold tracking-[0.22em] text-[var(--mc-text)]">
                FOCUS REALM <span className="text-[var(--mc-dim)]">{"//"}</span> MISSION CONTROL
              </div>
              <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--mc-muted)]">{scopeLabel}</div>
            </div>
          </div>
          <div
            className={cn(
              "inline-flex items-center gap-2 self-start whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[10.5px] font-semibold tracking-[0.16em] lg:ml-2 lg:self-auto",
              nominal
                ? "border-[var(--mc-green)]/30 bg-[var(--mc-green)]/10 text-[var(--mc-green)]"
                : "border-[var(--mc-red)]/40 bg-[var(--mc-red)]/10 text-[var(--mc-red)]",
            )}
          >
            <span className={cn(!nominal && "mc-blink")}>●</span>
            {nominal ? "ALL SYSTEMS NOMINAL" : `${s.overdue} PAST DEADLINE`}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 whitespace-nowrap font-mono text-[11px] tracking-wider text-[var(--mc-muted)] lg:ml-auto">
            <span>
              LOCAL <FlipText text={now ? clock(now, tz) : "--:--:--"} className="text-[13px] font-semibold text-[var(--mc-text)]" />
            </span>
            <span>
              UTC <FlipText text={now ? clock(now, "UTC") : "--:--:--"} className="text-[13px] font-semibold text-[var(--mc-text)]" />
            </span>
            <span className="hidden 2xl:inline">
              UPLINK <span className="text-[var(--mc-green)]">●</span> <span className="text-[var(--mc-text)]">{sinceSync}s</span>
            </span>
            <Link
              href="/tasks/new"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#2f86f0] to-[#1655c0] px-3 text-[11px] font-semibold tracking-[0.14em] text-white shadow-[0_0_24px_-4px_rgba(47,134,240,0.8)] transition hover:brightness-110 active:scale-95"
            >
              <Plus className="size-3.5" /> NEW MISSION
            </Link>
          </div>
        </motion.header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1.15fr)]">
          {/* Left column: readouts */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-1">
            <HudPanel title="Next launch" code="T-MINUS" className="col-span-2 xl:col-span-1" delay={0.05}>
              {next && nextT ? (
                <Link href={`/tasks/${next.id}`} className="group block">
                  <div className={cn("text-[34px] font-semibold leading-none sm:text-[38px]", nextT.late ? "mc-glow-red text-[var(--mc-red)]" : "mc-glow-text text-[var(--mc-cyan)]")}>
                    <span className="mr-2 font-mono text-[16px] text-[var(--mc-muted)]">{nextT.sign}</span>
                    <FlipText text={nextT.text} />
                  </div>
                  <div className="mt-2 truncate text-[13px] font-medium text-[var(--mc-text)] group-hover:text-white">
                    T-{next.number} · {next.title}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] tracking-wider text-[var(--mc-muted)]">
                    CREW {next.assignees.map((a) => a.firstName.toUpperCase()).join(" · ")}
                  </div>
                </Link>
              ) : (
                <div className="font-mono text-[12px] tracking-widest text-[var(--mc-muted)]">NO UPCOMING DEADLINES</div>
              )}
            </HudPanel>
            <Readout label="Active missions" value={s.open} delay={0.1} href="/tasks?scope=all" />
            <Readout label="Past deadline" value={s.overdue} delay={0.15} tone={s.overdue ? "red" : "green"} />
            <Readout label="Due < 48 hours" value={s.dueSoon} delay={0.2} tone={s.dueSoon ? "amber" : undefined} />
            <Readout
              label="Completed · 7 days"
              value={s.doneThisWeek}
              delay={0.25}
              tone="green"
              sub={doneDelta === 0 ? "level with last week" : `${doneDelta > 0 ? "▲" : "▼"} ${Math.abs(doneDelta)} vs last week`}
            />
          </div>

          {/* Centre: radar */}
          <HudPanel title="Crew radar" code="SYS-01 · LIVE" delay={0.12} className="min-h-[420px]" bodyClassName="flex flex-col justify-center">
            <OrbitRadar crew={data.crew} />
          </HudPanel>

          {/* Right: launch schedule */}
          <HudPanel
            title="Launch schedule"
            code="DEADLINES"
            delay={0.18}
            right={
              <Link href="/tasks?scope=all&view=board" className="inline-flex items-center gap-1 font-mono text-[10px] tracking-widest text-[var(--mc-muted)] hover:text-white">
                BOARD <ArrowUpRight className="size-3" />
              </Link>
            }
          >
            <TMinusBoard tasks={data.schedule} now={now} />
          </HudPanel>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <HudPanel title="Throughput" code="SYS-02 · 14D" delay={0.24}>
            <ThroughputChart series={data.series} />
          </HudPanel>
          <HudPanel title="Mission log" code="STREAM" delay={0.3} bodyClassName="bg-[#050b18]/60 rounded-b-2xl">
            <TelemetryStream entries={data.recent} tz={tz} />
          </HudPanel>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
          <HudPanel title="Crew load" code="FUEL" delay={0.36}>
            <CrewLoad crew={data.crew} />
          </HudPanel>
          <HudPanel title="Mission success" code="SYS-03" delay={0.42}>
            <SuccessGauge value={s.onTime} sample={s.closedMonth} />
            <div className="mt-5">
              <StatusMatrix status={data.status} />
            </div>
          </HudPanel>
          <HudPanel title="Awaiting comms" code="UPDATE REQ" delay={0.48} className="md:col-span-2 xl:col-span-1">
            {data.requests.length === 0 ? (
              <p className="py-8 text-center font-mono text-[11px] tracking-widest text-[var(--mc-muted)]">ALL CHANNELS CLEAR</p>
            ) : (
              <ul className="space-y-2">
                {data.requests.map((r, i) => (
                  <motion.li key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + i * 0.07 }}>
                    <Link
                      href={`/tasks/${r.task.id}`}
                      className="flex items-start gap-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-3 transition hover:border-violet-400/40"
                    >
                      <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-violet-300" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium">
                          T-{r.task.number} · {r.task.title}
                        </div>
                        <div className="truncate font-mono text-[10px] tracking-wider text-[var(--mc-muted)]">
                          {r.requestedBy.firstName.toUpperCase()} → {r.task.assignees.map((a) => a.user.firstName.toUpperCase()).join(", ")}
                          <span className="text-[var(--mc-amber)]" suppressHydrationWarning>
                            {" "}
                            · WAITING {now ? Math.max(1, Math.round((now.getTime() - new Date(r.createdAt).getTime()) / 3_600_000)) : "–"}H
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </HudPanel>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[9.5px] tracking-[0.22em] text-[var(--mc-dim)]">
          <span>
            CREW {s.crew} · DEPTS {s.departments} · OPEN {s.open} · AWAITING {s.awaitingUpdates}
          </span>
          <span>FR-WORKSPACE · TELEMETRY RESYNC {REFRESH_MS / 1000}S</span>
        </div>
      </div>
    </div>
  );
}

function Readout({
  label,
  value,
  tone,
  sub,
  delay,
  href,
}: {
  label: string;
  value: number;
  tone?: "red" | "green" | "amber";
  sub?: string;
  delay: number;
  href?: string;
}) {
  const color = tone === "red" ? "text-[var(--mc-red)] mc-glow-red" : tone === "amber" ? "text-[var(--mc-amber)]" : tone === "green" ? "text-[var(--mc-green)]" : "text-[var(--mc-text)] mc-glow-text";
  const body = (
    <HudPanel title={label} delay={delay} bodyClassName="py-3">
      <div className={cn("text-[34px] font-semibold leading-none", color)}>
        <Telemetry value={value} />
      </div>
      {sub && <div className="mt-1.5 font-mono text-[10px] tracking-wider text-[var(--mc-muted)]">{sub}</div>}
    </HudPanel>
  );
  return href ? (
    <Link href={href} className="block transition hover:brightness-125">
      {body}
    </Link>
  ) : (
    body
  );
}
