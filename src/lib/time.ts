/**
 * Deadlines are stored in UTC and always shown in the viewer's time zone.
 * The browser reports its zone in the `fr_tz` cookie; until it does, the
 * company default (APP_TIMEZONE) is used. Pure functions — safe on the server
 * and the client.
 */

export const TZ_COOKIE = "fr_tz";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const DUE_SOON_HOURS = 24;
export const DUE_URGENT_HOURS = 2;

export function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "2026-10-09" for the calendar day `date` falls on in `tz`. */
export function dayKey(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dayDiff(date: Date, now: Date, tz: string) {
  const a = Date.parse(`${dayKey(date, tz)}T00:00:00Z`);
  const b = Date.parse(`${dayKey(now, tz)}T00:00:00Z`);
  return Math.round((a - b) / DAY);
}

export function formatTime(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatDate(date: Date, tz: string, opts: { year?: boolean; weekday?: boolean } = {}) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    ...(opts.year ? { year: "numeric" } : {}),
    ...(opts.weekday ? { weekday: "short" } : {}),
  }).format(date);
}

export function formatLongDate(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date, tz: string) {
  return `${formatDate(date, tz, { year: true })}, ${formatTime(date, tz)}`;
}

/** "Today, 6:00 PM" · "Tomorrow, 10:00 AM" · "Mon, Oct 12, 6:00 PM" · "Oct 12, 2027, 6:00 PM". */
export function formatDue(date: Date, tz: string, now = new Date()) {
  const diff = dayDiff(date, now, tz);
  const time = formatTime(date, tz);
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Tomorrow, ${time}`;
  if (diff === -1) return `Yesterday, ${time}`;
  const sameYear = dayKey(date, tz).slice(0, 4) === dayKey(now, tz).slice(0, 4);
  if (diff > 1 && diff < 7) return `${formatDate(date, tz, { weekday: true })}, ${time}`;
  return `${formatDate(date, tz, { year: !sameYear })}, ${time}`;
}

/** "in 3h 20m" · "in 2 days" · "5h overdue" · "3 days overdue". */
export function formatCountdown(date: Date, now = new Date()) {
  const ms = date.getTime() - now.getTime();
  const abs = Math.abs(ms);
  let label: string;
  if (abs < 60 * 1000) label = "less than a minute";
  else if (abs < HOUR) label = `${Math.round(abs / 60000)}m`;
  else if (abs < DAY) {
    const h = Math.floor(abs / HOUR);
    const m = Math.round((abs % HOUR) / 60000);
    label = m && h < 6 ? `${h}h ${m}m` : `${h}h`;
  } else {
    const d = Math.round(abs / DAY);
    label = `${d} ${d === 1 ? "day" : "days"}`;
  }
  return ms >= 0 ? `in ${label}` : `${label} overdue`;
}

export function timeAgo(date: Date, now = new Date()) {
  const s = Math.round((now.getTime() - date.getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export type DueState = "done" | "overdue" | "urgent" | "soon" | "upcoming";

export function dueState(dueAt: Date, status: string, now = new Date()): DueState {
  if (status === "DONE") return "done";
  const ms = dueAt.getTime() - now.getTime();
  if (ms <= 0) return "overdue";
  if (ms <= DUE_URGENT_HOURS * HOUR) return "urgent";
  if (ms <= DUE_SOON_HOURS * HOUR) return "soon";
  return "upcoming";
}

export type DueBucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "done";

export const DUE_BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  tomorrow: "Due tomorrow",
  week: "This week",
  later: "Later",
  done: "Completed",
};

export function dueBucket(dueAt: Date, status: string, tz: string, now = new Date()): DueBucket {
  if (status === "DONE") return "done";
  if (dueAt.getTime() < now.getTime()) return "overdue";
  const diff = dayDiff(dueAt, now, tz);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 7) return "week";
  return "later";
}

export function greeting(now: Date, tz: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The UTC instant of midnight starting the day `date` falls on in `tz`. */
export function startOfDayInZone(date: Date, tz: string) {
  const key = dayKey(date, tz);
  const guess = new Date(`${key}T00:00:00Z`);
  // Offset of tz at that moment, in ms (positive east of UTC).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}
