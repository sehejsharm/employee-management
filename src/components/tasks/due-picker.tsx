"use client";

import * as React from "react";
import { CalendarClock } from "lucide-react";
import { fieldBase } from "@/components/ui/input";
import { formatCountdown } from "@/lib/time";
import { useNow } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/** "2026-10-09T18:00" in the browser's local time — the format datetime-local inputs speak. */
export function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function at(base: Date, addDays: number, hour: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function nextWeekday(base: Date, weekday: number, hour: number) {
  const diff = (weekday - base.getDay() + 7) % 7 || 7;
  return at(base, diff, hour);
}

/**
 * The deadline: a date AND a time. A native picker (best on phones) plus
 * one-tap presets for the deadlines people actually set.
 */
export function DuePicker({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  // Presets are relative to "now" in the browser's own time zone; null until hydrated.
  const now = useNow(60_000);

  const presets = React.useMemo(() => {
    if (!now) return [];
    const list: { label: string; date: Date }[] = [];
    const todayEvening = at(now, 0, 18);
    if (todayEvening.getTime() - now.getTime() > 60 * 60 * 1000) list.push({ label: "Today, 6 PM", date: todayEvening });
    list.push({ label: "Tomorrow, 10 AM", date: at(now, 1, 10) });
    list.push({ label: "Tomorrow, 6 PM", date: at(now, 1, 18) });
    if (now.getDay() >= 1 && now.getDay() <= 3) list.push({ label: "Friday, 5 PM", date: nextWeekday(now, 5, 17) });
    list.push({ label: "Next Monday, 10 AM", date: nextWeekday(now, 1, 10) });
    list.push({ label: "In a week", date: at(now, 7, 18) });
    return list;
  }, [now]);

  const parsed = value ? new Date(value) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime());

  return (
    <div>
      <div className="relative">
        <CalendarClock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <input
          id={id}
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldBase, "h-11 pl-9 pr-3 tabular")}
          required
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const v = toLocalInput(p.date);
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(v)}
              className={cn(
                "h-7 rounded-full border px-2.5 text-xs font-medium transition",
                value === v ? "border-brand/40 bg-brand-soft text-brand-soft-fg" : "border-line text-fg-muted hover:border-line-strong hover:text-fg",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {valid && now && (
        <p className={cn("mt-2 text-xs", parsed!.getTime() < now.getTime() ? "text-danger" : "text-fg-subtle")}>
          {parsed!.getTime() < now.getTime() ? "That's in the past." : `Due ${formatCountdown(parsed!, now)}`} ·{" "}
          {parsed!.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
