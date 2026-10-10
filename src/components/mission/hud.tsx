"use client";

import * as React from "react";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * A Mission Control module: the brand Card and CardHeader, unchanged, with a
 * soft rise-in on arrival. One card spec for the whole Workspace.
 */
export function HudPanel({
  title,
  icon,
  eyebrow,
  right,
  children,
  className,
  bodyClassName,
  delay = 0,
}: {
  title: string;
  icon?: React.ReactNode;
  eyebrow?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay }}
      className={cn("min-w-0", className)}
    >
      <Card className="flex h-full flex-col">
        <CardHeader icon={icon} title={title} description={eyebrow} action={right} />
        <CardBody className={cn("relative min-h-0 flex-1", bodyClassName)}>{children}</CardBody>
      </Card>
    </motion.div>
  );
}

/** A figure that counts up from zero the first time it comes into view (instantly, under reduced motion). */
export function Telemetry({ value, className, suffix = "" }: { value: number; className?: string; suffix?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  // Zero on server and client alike (hydration-safe); reduced motion jumps straight to the value.
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${Math.round(v)}${suffix}`);
  React.useEffect(() => {
    if (!inView) return;
    const c = animate(mv, value, { duration: reduce ? 0 : 1.2, ease: EASE });
    return () => c.stop();
  }, [inView, value, mv, reduce]);
  return (
    <motion.span ref={ref} className={cn("tabular", className)}>
      {text}
    </motion.span>
  );
}

/** Each character slides in when it changes — an odometer for clocks and countdowns. */
export function FlipText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("inline-flex font-mono tabular", className)} aria-label={text}>
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
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, ms);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [ms]);
  return now;
}

export { useMounted } from "@/lib/hooks";

export function clock(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}

/** Time to (or past) a deadline: "02:13:45", rolling into "3d 04:00:00". `late` once it has passed. */
export function tMinus(due: Date, now: Date) {
  const ms = due.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const d = Math.floor(abs / 86_400_000);
  const h = Math.floor((abs % 86_400_000) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { ms, late: ms < 0, text: `${d ? `${d}d ` : ""}${pad(h)}:${pad(m)}:${pad(s)}` };
}

/** "Due soon" everywhere in the Workspace means within a day — the same window as the 24-hour reminder. */
export const SOON_MS = 24 * 3_600_000;
