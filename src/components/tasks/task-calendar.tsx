"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientTaskRow } from "@/lib/tasks/queries";
import { dayKey, dueState, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parts(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

function keyOf(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A month of deadlines, laid out in the viewer's time zone. */
export function TaskCalendar({ tasks, tz }: { tasks: ClientTaskRow[]; tz: string }) {
  const todayKey = dayKey(new Date(), tz);
  const today = parts(todayKey);
  const [cursor, setCursor] = React.useState({ y: today.y, m: today.m });
  const [direction, setDirection] = React.useState(0);
  const [selected, setSelected] = React.useState<string | null>(todayKey);

  const byDay = React.useMemo(() => {
    const map = new Map<string, ClientTaskRow[]>();
    for (const t of tasks) {
      const k = dayKey(new Date(t.dueAt), tz);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    for (const list of map.values()) list.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    return map;
  }, [tasks, tz]);

  const first = new Date(Date.UTC(cursor.y, cursor.m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m, 0)).getUTCDate();
  const cells: { key: string; inMonth: boolean; day: number }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(Date.UTC(cursor.y, cursor.m - 1, 1 - lead + i));
    cells.push({
      key: keyOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()),
      inMonth: date.getUTCMonth() + 1 === cursor.m,
      day: date.getUTCDate(),
    });
  }
  const rows = lead + daysInMonth > 35 ? 6 : 5;
  const monthLabel = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const shift = (delta: number) => {
    setDirection(delta);
    setCursor((c) => {
      const d = new Date(Date.UTC(c.y, c.m - 1 + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
    });
  };

  const selectedTasks = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="text-[15px] font-semibold tracking-tight">{monthLabel}</div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setDirection(0);
                setCursor({ y: today.y, m: today.m });
                setSelected(todayKey);
              }}
            >
              Today
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-line bg-surface-sunken/50">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
              {d}
            </div>
          ))}
        </div>
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={`${cursor.y}-${cursor.m}`}
            custom={direction}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-7"
          >
            {cells.slice(0, rows * 7).map((c) => {
              const list = byDay.get(c.key) ?? [];
              const isToday = c.key === todayKey;
              const isSelected = c.key === selected;
              const overdue = list.some((t) => dueState(new Date(t.dueAt), t.status) === "overdue");
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setSelected(c.key)}
                  className={cn(
                    "group relative flex min-h-[64px] flex-col items-stretch border-b border-r border-line p-1.5 text-left transition-colors sm:min-h-[104px] [&:nth-child(7n)]:border-r-0",
                    !c.inMonth && "bg-surface-sunken/40",
                    isSelected ? "bg-brand-soft/60" : "hover:bg-surface-hover",
                  )}
                >
                  <span
                    className={cn(
                      "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium tabular",
                      isToday ? "bg-brand text-white" : c.inMonth ? "text-fg" : "text-fg-subtle",
                    )}
                  >
                    {c.day}
                  </span>
                  <div className="hidden flex-col gap-0.5 sm:flex">
                    {list.slice(0, 3).map((t) => (
                      <span
                        key={t.id}
                        className={cn(
                          "truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                          t.status === "DONE"
                            ? "bg-surface-sunken text-fg-subtle line-through"
                            : dueState(new Date(t.dueAt), t.status) === "overdue"
                              ? "bg-danger-soft text-danger"
                              : t.priority === "URGENT" || t.priority === "HIGH"
                                ? "bg-warning-soft text-warning"
                                : "bg-brand-soft text-brand-soft-fg",
                        )}
                      >
                        {t.title}
                      </span>
                    ))}
                    {list.length > 3 && <span className="px-1.5 text-[11px] text-fg-subtle">+{list.length - 3} more</span>}
                  </div>
                  {list.length > 0 && (
                    <span className="mt-auto flex gap-0.5 sm:hidden">
                      {list.slice(0, 4).map((t) => (
                        <span key={t.id} className={cn("h-1.5 w-1.5 rounded-full", overdue ? "bg-danger" : "bg-brand")} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="mb-3 text-[13px] font-semibold">
          {selected
            ? new Date(`${selected}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })
            : "Pick a day"}
        </div>
        {selectedTasks.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-fg-subtle">No deadlines on this day.</p>
        ) : (
          <ul className="space-y-2">
            {selectedTasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tasks/${t.id}`}
                  className="block rounded-xl border border-line p-3 transition hover:border-brand/30 hover:bg-surface-hover"
                >
                  <div className="text-[13px] font-medium leading-snug wrap-anywhere">{t.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-fg-subtle">
                    <span className="font-mono">T-{t.number}</span>·<span>{formatTime(new Date(t.dueAt), tz)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
