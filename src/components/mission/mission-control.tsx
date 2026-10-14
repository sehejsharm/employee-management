"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  Activity,
  AlarmClock,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Gauge,
  MessageCircleQuestion,
  Plus,
  Radar,
  Timer,
  TrendingUp,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { BrandMark } from "@/components/brand/logo";
import { StatCard } from "@/components/dashboard/widgets";
import { AvatarStack } from "@/components/ui/avatar";
import type { MissionData } from "@/lib/dashboard";
import { formatDue } from "@/lib/time";
import { cn } from "@/lib/utils";
import { EASE, FlipText, HudPanel, clock, tMinus, useTick } from "./hud";
import { OrbitRadar, RadarSummary } from "./orbit-radar";
import { TMinusBoard } from "./t-minus";
import { ThroughputChart } from "./throughput-chart";
import { ActivityLog, OnTimeGauge, StatusMatrix, Workload } from "./telemetry";
import "./mission.css";

const REFRESH_MS = 60_000;

function waited(since: string, now: Date) {
  const h = Math.max(1, Math.round((now.getTime() - new Date(since).getTime()) / 3_600_000));
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/**
 * Mission Control — the founders' live view of everything their team is
 * working on. Clocks and countdowns tick every second; the data re-syncs every
 * minute while the screen is visible. Built entirely from the brand tokens
 * and the shared Card spec (docs/BRAND.md), so it is blue-and-white in light
 * mode and navy-and-blue in dark mode, like the rest of the Workspace.
 */
export function MissionControl({ data, tz, scopeLabel }: { data: MissionData; tz: string; scopeLabel: string }) {
  const router = useRouter();
  const now = useTick(1000);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);

  const s = data.stats;
  const allClear = s.overdue === 0;
  const next = data.schedule.find((t) => now && new Date(t.dueAt) > now) ?? null;
  const nextT = next && now ? tMinus(new Date(next.dueAt), now) : null;
  const doneDelta = s.doneThisWeek - s.donePrevWeek;
  const syncedAgo = now ? Math.max(0, Math.round((now.getTime() - new Date(data.generatedAt).getTime()) / 1000)) : 0;

  return (
    <div className="relative -mx-4 overflow-hidden border-y border-line bg-surface-sunken/60 sm:mx-0 sm:rounded-3xl sm:border">
      {/* Atmosphere: the brand grid and two slow pools of blue light */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-70 [mask-image:radial-gradient(120%_70%_at_50%_0%,var(--brand)_30%,transparent)]" />
      <div className="mc-blob mc-blob--a pointer-events-none -left-32 -top-40 h-[420px] w-[420px] bg-brand/15" />
      <div className="mc-blob mc-blob--b pointer-events-none -right-40 top-1/3 h-[460px] w-[460px] bg-brand-400/15" />

      <div className="relative p-3 sm:p-5 lg:p-6">
        {/* Header band — white on brand blue */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="relative mb-4 overflow-hidden rounded-2xl bg-brand-gradient px-4 py-4 text-white shadow-brand sm:px-5"
        >
          <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/15" />
          <div className="pointer-events-none absolute -right-4 -top-12 h-40 w-40 rounded-full border border-white/10" />
          <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="flex items-center gap-3">
                <BrandMark size={34} variant="inverse" />
                <div className="leading-tight">
                  <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Mission Control</h2>
                  <p className="text-[12.5px] text-white/75">{scopeLabel}</p>
                </div>
              </div>
              <div
                className={cn(
                  "inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold",
                  allClear ? "bg-white/15 text-white ring-1 ring-inset ring-white/25" : "bg-white text-danger shadow-sm",
                )}
                role="status"
              >
                <span className="relative flex h-2 w-2">
                  {!allClear && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75 motion-reduce:hidden" />}
                  <span className={cn("relative inline-flex h-2 w-2 rounded-full", allClear ? "bg-white" : "bg-danger")} />
                </span>
                {allClear ? "Every deadline on track" : `${s.overdue} task${s.overdue === 1 ? "" : "s"} overdue`}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 whitespace-nowrap text-[12px] text-white/75 xl:ml-auto">
              <span className="flex items-center gap-2">
                Local <FlipText text={now ? clock(now, tz) : "--:--:--"} className="text-[14px] font-semibold text-white" />
              </span>
              <span className="flex items-center gap-2">
                UTC <FlipText text={now ? clock(now, "UTC") : "--:--:--"} className="text-[14px] font-semibold text-white" />
              </span>
              <Link
                href="/tasks/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-brand-700 shadow-sm transition hover:bg-brand-50 active:scale-[0.97]"
              >
                <Plus className="size-4" /> New task
              </Link>
            </div>
          </div>
        </motion.header>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)_minmax(0,1.2fr)]">
          {/* The next deadline and the headline numbers */}
          <div className="grid grid-cols-2 content-start gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-1">
            <HudPanel title="Next deadline" icon={<Timer />} className="col-span-2 lg:row-span-2 xl:col-span-1 xl:row-span-1" delay={0.05}>
              {next && nextT ? (
                <Link href={`/tasks/${next.id}`} className="group block">
                  <div className="flex items-baseline gap-2 whitespace-nowrap text-[30px] font-semibold leading-none tracking-[-0.02em] text-brand">
                    <span className="font-mono text-[14px] text-fg-subtle">T–</span>
                    <FlipText text={nextT.text} />
                  </div>
                  <div className="mt-1.5 text-xs text-fg-subtle">Due {formatDue(new Date(next.dueAt), tz, now ?? undefined)}</div>
                  <div className="mt-3 line-clamp-2 text-[13.5px] font-medium text-fg group-hover:text-brand">
                    <span className="font-mono text-[12px] text-fg-subtle">T-{next.number}</span> {next.title}
                  </div>
                  <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-fg-subtle">
                    <AvatarStack people={next.assignees} max={4} size="xs" />
                    <span className="truncate">{next.assignees.map((a) => a.firstName).join(", ")}</span>
                  </div>
                </Link>
              ) : (
                <p className="text-[13px] text-fg-subtle">{now ? "No upcoming deadlines." : "Syncing…"}</p>
              )}
            </HudPanel>
            <StatCard index={1} label="Open tasks" value={s.open} icon={<ClipboardList />} href="/tasks?scope=all" />
            <StatCard index={2} label="Overdue" value={s.overdue} icon={<TriangleAlert />} tone={s.overdue ? "danger" : "success"} />
            <StatCard index={3} label="Due within a day" value={s.dueSoon} icon={<AlarmClock />} tone={s.dueSoon ? "warning" : "brand"} />
            <StatCard
              index={4}
              label="Done this week"
              value={s.doneThisWeek}
              icon={<CheckCircle2 />}
              tone="success"
              trend={{ delta: doneDelta, label: doneDelta === 0 ? "Same as last week" : "vs last week" }}
            />
          </div>

          {/* The team radar */}
          <HudPanel
            title="Team radar"
            eyebrow="Deadline health by person"
            icon={<Radar />}
            delay={0.12}
            right={<RadarSummary crew={data.crew} />}
            bodyClassName="flex flex-col justify-center"
          >
            <OrbitRadar crew={data.crew} />
          </HudPanel>

          {/* Every deadline, counting down */}
          <HudPanel
            title="Deadline countdown"
            eyebrow="Soonest first, to the second"
            icon={<AlarmClock />}
            delay={0.18}
            right={
              <Link href="/tasks?scope=all&view=board" className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-brand">
                Board <ArrowUpRight className="size-3.5" />
              </Link>
            }
          >
            <TMinusBoard tasks={data.schedule} now={now} />
          </HudPanel>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <HudPanel title="Throughput" eyebrow="Completed vs assigned · last 14 days" icon={<TrendingUp />} delay={0.24}>
            <ThroughputChart series={data.series} />
          </HudPanel>
          <HudPanel title="Activity" eyebrow="What the team just did" icon={<Activity />} delay={0.3}>
            <ActivityLog entries={data.recent} tz={tz} reference={data.generatedAt} />
          </HudPanel>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1fr)]">
          <HudPanel title="Workload" eyebrow="Open tasks per person" icon={<UsersRound />} delay={0.36}>
            <Workload crew={data.crew} />
          </HudPanel>
          <HudPanel title="On-time rate" eyebrow="Closed tasks, last 30 days" icon={<Gauge />} delay={0.42}>
            <OnTimeGauge value={s.onTime} sample={s.closedMonth} />
            <div className="mt-5 border-t border-line pt-4">
              <StatusMatrix status={data.status} />
            </div>
          </HudPanel>
          <HudPanel
            title="Waiting on updates"
            eyebrow="Requests not yet answered"
            icon={<MessageCircleQuestion />}
            delay={0.48}
            className="md:col-span-2 xl:col-span-1"
          >
            {data.requests.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-fg-subtle">Every request has been answered.</p>
            ) : (
              <ul className="space-y-2">
                {data.requests.map((r, i) => (
                  <motion.li
                    key={r.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE, delay: 0.5 + i * 0.06 }}
                  >
                    <Link
                      href={`/tasks/${r.task.id}`}
                      className="flex items-start gap-3 rounded-xl border border-line bg-surface p-3 transition hover:border-info/40 hover:bg-info-soft/50"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-info-soft text-info">
                        <MessageCircleQuestion className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">
                          <span className="font-mono text-[11.5px] text-fg-subtle">T-{r.task.number}</span> {r.task.title}
                        </div>
                        <div className="truncate text-xs text-fg-subtle">
                          {r.requestedBy.firstName} asked {r.task.assignees.map((a) => a.user.firstName).join(", ") || "the assignee"}
                          {now && <span className="font-medium text-info"> · waiting {waited(r.createdAt, now)}</span>}
                        </div>
                      </div>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </HudPanel>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[11.5px] text-fg-subtle">
          <span>
            {s.crew} people · {s.departments} departments · {s.open} open · {s.awaitingUpdates} waiting on updates
          </span>
          <span suppressHydrationWarning>
            Live · refreshed {syncedAgo < 60 ? `${syncedAgo}s` : `${Math.round(syncedAgo / 60)}m`} ago · updates every {REFRESH_MS / 1000}s
          </span>
        </div>
      </div>
    </div>
  );
}
