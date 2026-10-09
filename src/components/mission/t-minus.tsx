"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { MessageCircleQuestion } from "lucide-react";
import type { ClientTaskRow } from "@/lib/tasks/queries";
import { cn } from "@/lib/utils";
import { EASE, tMinus } from "./hud";

const PRIORITY_COLOR: Record<string, string> = { URGENT: "#f87171", HIGH: "#fbbf24", MEDIUM: "#5aa7f8", LOW: "#64748b" };

/** The launch schedule: every open deadline, counting down to the second. */
export function TMinusBoard({ tasks, now }: { tasks: ClientTaskRow[]; now: Date | null }) {
  if (tasks.length === 0) {
    return <p className="py-10 text-center font-mono text-[11px] tracking-widest text-[var(--mc-muted)]">NO MISSIONS SCHEDULED</p>;
  }
  return (
    <ul className="space-y-1.5">
      {tasks.map((t, i) => {
        const tm = now ? tMinus(new Date(t.dueAt), now) : null;
        const urgent = tm && !tm.late && new Date(t.dueAt).getTime() - now!.getTime() < 2 * 3600_000;
        return (
          <motion.li
            key={t.id}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.6 + i * 0.06 }}
          >
            <Link
              href={`/tasks/${t.id}`}
              className={cn(
                "group relative block overflow-hidden rounded-xl border px-3 py-2.5 transition-colors",
                tm?.late ? "border-[var(--mc-red)]/35 bg-[var(--mc-red)]/[0.07]" : "border-[var(--mc-line)] bg-white/[0.02] hover:border-[var(--mc-line-strong)] hover:bg-white/[0.04]",
              )}
            >
              <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: PRIORITY_COLOR[t.priority] }} />
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10.5px] text-[var(--mc-dim)]">T-{t.number}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--mc-text)] group-hover:text-white">{t.title}</span>
                {t.awaitingUpdate && <MessageCircleQuestion className="size-3.5 shrink-0 text-violet-300" />}
                <span
                  className={cn(
                    "shrink-0 font-mono text-[12px] font-semibold tabular-nums",
                    tm?.late ? "mc-glow-red text-[var(--mc-red)]" : urgent ? "text-[var(--mc-amber)]" : "text-[var(--mc-cyan)]",
                  )}
                  suppressHydrationWarning
                >
                  {tm ? `${tm.sign} ${tm.text}` : "--:--:--"}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div
                    className={cn("mc-shimmer h-full rounded-full", tm?.late ? "bg-[var(--mc-red)]" : "bg-gradient-to-r from-[#2f86f0] to-[#67e8f9]")}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(t.progress, 3)}%` }}
                    transition={{ duration: 1.2, ease: EASE, delay: 0.8 + i * 0.06 }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-[10px] text-[var(--mc-muted)]">{t.progress}%</span>
                <span className="flex -space-x-1">
                  {t.assignees.slice(0, 3).map((a) => (
                    <span
                      key={a.id}
                      title={`${a.firstName} ${a.lastName}`}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white ring-2 ring-[#050c1a]"
                      style={{ backgroundImage: `linear-gradient(140deg, hsl(${a.avatarHue} 85% 62%), hsl(${(a.avatarHue + 18) % 360} 72% 42%))` }}
                    >
                      {a.firstName[0]}
                      {a.lastName[0] ?? ""}
                    </span>
                  ))}
                </span>
              </div>
            </Link>
          </motion.li>
        );
      })}
    </ul>
  );
}
