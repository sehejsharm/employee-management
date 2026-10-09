"use client";

import * as React from "react";
import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

export const EASE = [0.16, 1, 0.3, 1] as const;

/** A framed HUD module: corner brackets, a coded title strip, and a boot-in animation. */
export function HudPanel({
  title,
  code,
  right,
  children,
  className,
  bodyClassName,
  delay = 0,
}: {
  title: string;
  code?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.8, ease: EASE, delay }}
      className={cn(
        "relative flex min-w-0 flex-col rounded-2xl border border-[var(--mc-line)] bg-[var(--mc-panel)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_20px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-md",
        className,
      )}
    >
      <span className="mc-corner mc-corner--tl" />
      <span className="mc-corner mc-corner--tr" />
      <span className="mc-corner mc-corner--bl" />
      <span className="mc-corner mc-corner--br" />
      <header className="flex items-center gap-2 border-b border-[var(--mc-line)] px-4 py-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--mc-cyan)] shadow-[0_0_8px_2px_rgba(103,232,249,0.6)]" />
        <h3 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[var(--mc-muted)]">{title}</h3>
        {code && <span className="font-mono text-[10px] tracking-wider text-[var(--mc-dim)]">{code}</span>}
        <div className="ml-auto">{right}</div>
      </header>
      <div className={cn("relative min-h-0 flex-1 p-4", bodyClassName)}>{children}</div>
    </motion.section>
  );
}

/** A number that rolls up from zero the first time it's seen. */
export function Telemetry({ value, className, decimals = 0, suffix = "" }: { value: number; className?: string; decimals?: number; suffix?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${v.toFixed(decimals)}${suffix}`);
  React.useEffect(() => {
    if (!inView) return;
    const c = animate(mv, value, { duration: 1.6, ease: EASE });
    return () => c.stop();
  }, [inView, value, mv]);
  return (
    <motion.span ref={ref} className={cn("font-mono tabular-nums", className)}>
      {text}
    </motion.span>
  );
}

/** Each character slides in when it changes — an odometer for clocks and countdowns. */
export function FlipText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("inline-flex font-mono tabular-nums", className)} aria-label={text}>
      {text.split("").map((ch, i) => (
        <span key={i} className="relative inline-block overflow-hidden" style={{ width: /[0-9]/.test(ch) ? "0.62em" : undefined }}>
          <motion.span
            key={ch}
            initial={{ y: "-60%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="inline-block"
          >
            {ch}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** A one-second heartbeat shared by every live readout on the screen. */
export function useTick(ms = 1000) {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export function clock(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}

/** "T– 02:13:45" before a deadline, "T+ 05:10:00" after it; days roll into "3D 04:00:00". */
export function tMinus(due: Date, now: Date) {
  const ms = due.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { sign: ms >= 0 ? "T–" : "T+", late: ms < 0, text: `${d ? `${d}D ` : ""}${pad(h)}:${pad(m)}:${pad(s)}` };
}

/** True after hydration. Animated SVGs render client-side only, so server HTML never disagrees with them. */
export function useMounted() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}
