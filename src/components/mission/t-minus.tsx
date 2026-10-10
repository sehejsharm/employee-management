"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { MessageCircleQuestion } from "lucide-react";
import { AvatarStack } from "@/components/ui/avatar";
import { PRIORITY_META } from "@/components/tasks/meta";
import type { ClientTaskRow } from "@/lib/tasks/queries";
import { cn } from "@/lib/utils";
import { EASE, SOON_MS, tMinus } from "./hud";

/** Deadline state drives every colour on a row: overdue, due within a day, or on track. */
function stateOf(ms: number | null) {
  if (ms === null) return { edge: "bg-line-strong", text: "text-fg-subtle", bar: "bg-brand", row: "border-line bg-surface hover:bg-surface-hover" };
  if (ms < 0) return { edge: "bg-danger", text: "text-danger", bar: "bg-danger", row: "border-danger/25 bg-danger-soft/60 hover:bg-danger-soft" };
  if (ms <= SOON_MS) return { edge: "bg-warning", text: "text-warning", bar: "bg-brand", row: "border-line bg-surface hover:bg-surface-hover" };
  return { edge: "bg-brand", text: "text-brand", bar: "bg-brand", row: "border-line bg-surface hover:bg-surface-hover" };
}

/** Every open deadline in order, counting down to the second. */
export function TMinusBoard({ tasks, now }: { tasks: ClientTaskRow[]; now: Date | null }) {
  if (tasks.length === 0) {
    return <p className="py-10 text-center text-[13px] text-fg-subtle">No open deadlines. Everything is done.</p>;
  }
  return (
    <ul className="space-y-2">
      {tasks.map((t, i) => {
        const tm = now ? tMinus(new Date(t.dueAt), now) : null;
        const st = stateOf(tm ? tm.ms : null);
        const p = PRIORITY_META[t.priority];
        return (
          <motion.li
            key={t.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.3 + i * 0.05 }}
          >
            <Link
              href={`/tasks/${t.id}`}
              className={cn("group relative block overflow-hidden rounded-xl border py-2.5 pl-4 pr-3 transition-colors hover:border-line-strong", st.row)}
            >
              <span className={cn("absolute inset-y-0 left-0 w-[3px]", st.edge)} aria-hidden />
              <div className="flex items-center gap-2">
                <p.icon className={cn("size-3.5 shrink-0", p.className)} aria-label={`${p.label} priority`} />
                <span className="shrink-0 font-mono text-[11px] text-fg-subtle">T-{t.number}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg group-hover:text-brand">{t.title}</span>
                {t.awaitingUpdate && <MessageCircleQuestion className="size-3.5 shrink-0 text-info" aria-label="Waiting on an update" />}
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <div className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <motion.div
                    className={cn("h-full w-full origin-left rounded-full", st.bar, tm && !tm.late && "mc-shimmer")}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: Math.max(t.progress, 3) / 100 }}
                    transition={{ duration: 1.1, ease: EASE, delay: 0.5 + i * 0.05 }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[11px] text-fg-subtle tabular">{t.progress}%</span>
                <span className={cn("shrink-0 whitespace-nowrap text-[12px] font-semibold", st.text)} suppressHydrationWarning>
                  {tm ? (
                    <>
                      {tm.late ? "Overdue " : <span className="font-mono">T– </span>}
                      <span className="font-mono tabular">{tm.text}</span>
                    </>
                  ) : (
                    <span className="font-mono">--:--:--</span>
                  )}
                </span>
                <AvatarStack people={t.assignees} max={2} size="xs" className="hidden shrink-0 sm:flex" />
              </div>
            </Link>
          </motion.li>
        );
      })}
    </ul>
  );
}
