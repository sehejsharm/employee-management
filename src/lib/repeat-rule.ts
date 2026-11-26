/**
 * Repeat rules for repeating tasks, shared by the form's preview and the
 * server, so the dates a founder sees are the dates that get created.
 *
 * Every rule keeps the time of day of the first deadline (6 PM stays 6 PM in
 * the series' time zone, across DST), except DATES, where each date carries
 * its own time.
 */

export type RepeatFrequency = "DAILY" | "WEEKDAYS" | "WEEKLY" | "DAYS_OF_WEEK" | "MONTHLY" | "DATES";

export interface RepeatRule {
  frequency: RepeatFrequency;
  /** DAYS_OF_WEEK: 0 = Sunday … 6 = Saturday. */
  weekdays?: number[];
  /** MONTHLY: the day of the month (1–31; clamped to the month's last day). */
  monthDay?: number | null;
  /** DATES: every deadline, in order. */
  dates?: Date[];
}

export const MAX_OCCURRENCES = 90;

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DAY = 86_400_000;

/** Wall-clock parts of `date` in `tz`. */
export function localParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")),
    min: Number(get("minute")),
    s: Number(get("second")),
    dow: WEEKDAY_SHORT.indexOf(get("weekday") as (typeof WEEKDAY_SHORT)[number]),
  };
}

/** The instant that reads as the given wall-clock time in `tz` (handles DST by re-checking the offset). */
export function fromLocal(y: number, m: number, d: number, h: number, min: number, s: number, tz: string) {
  const wanted = Date.UTC(y, m - 1, d, h, min, s);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), tz);
    const seen = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    guess += wanted - seen;
  }
  return new Date(guess);
}

/** Same time of day, `days` later, in `tz`. */
function addLocalDays(date: Date, days: number, tz: string) {
  const p = localParts(date, tz);
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return fromLocal(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), p.h, p.min, p.s, tz);
}

/** Same time of day on `monthDay` of the month after `date` (31 → the 30th, or the 28th/29th in February). */
function nextMonth(date: Date, monthDay: number, tz: string) {
  const p = localParts(date, tz);
  const y = p.m === 12 ? p.y + 1 : p.y;
  const m = p.m === 12 ? 1 : p.m + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return fromLocal(y, m, Math.min(monthDay, last), p.h, p.min, p.s, tz);
}

function onDays(rule: RepeatRule): Set<number> | null {
  if (rule.frequency === "WEEKDAYS") return new Set([1, 2, 3, 4, 5]);
  if (rule.frequency === "DAYS_OF_WEEK") return new Set(rule.weekdays?.length ? rule.weekdays : [0, 1, 2, 3, 4, 5, 6]);
  return null;
}

/** The first deadline: `due` itself, or — when it falls on a day the rule skips — the next day it allows. */
export function firstDue(due: Date, rule: RepeatRule, tz: string) {
  if (rule.frequency === "DATES") return rule.dates?.[0] ?? due;
  const days = onDays(rule);
  let first = due;
  for (let i = 0; days && i < 7 && !days.has(localParts(first, tz).dow); i++) first = addLocalDays(first, 1, tz);
  return first;
}

/**
 * The deadline after one due at `due`. `index` is how many occurrences exist
 * once that one is created (DATES reads the next one from its list).
 */
export function nextDue(due: Date, rule: RepeatRule, tz: string, index = 1): Date | null {
  switch (rule.frequency) {
    case "DATES":
      return rule.dates?.[index] ?? null;
    case "WEEKLY":
      return addLocalDays(due, 7, tz);
    case "MONTHLY":
      return nextMonth(due, rule.monthDay ?? localParts(due, tz).d, tz);
    case "DAILY":
      return addLocalDays(due, 1, tz);
    default: {
      const days = onDays(rule)!;
      let next = addLocalDays(due, 1, tz);
      for (let i = 0; i < 7 && !days.has(localParts(next, tz).dow); i++) next = addLocalDays(next, 1, tz);
      return next;
    }
  }
}

/** Every deadline in a series, for previews ("30 tasks, 14 Oct → 12 Nov"). */
export function seriesDueDates(start: Date, rule: RepeatRule, total: number, tz: string) {
  if (rule.frequency === "DATES") return (rule.dates ?? []).slice(0, total);
  const out = [firstDue(start, rule, tz)];
  while (out.length < total) {
    const next = nextDue(out[out.length - 1], rule, tz, out.length);
    if (!next) break;
    out.push(next);
  }
  return out;
}

/** How long before its deadline an occurrence appears: a week for weekly and monthly series, a day otherwise. */
export function leadTime(rule: Pick<RepeatRule, "frequency">) {
  return rule.frequency === "WEEKLY" || rule.frequency === "MONTHLY" ? 7 * DAY : DAY;
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

/** "every day", "every Mon & Thu", "on the 15th of every month", "on 4 chosen dates". */
export function repeatLabel(rule: RepeatRule & { total?: number }) {
  switch (rule.frequency) {
    case "DAILY":
      return "every day";
    case "WEEKDAYS":
      return "every weekday";
    case "WEEKLY":
      return "every week";
    case "MONTHLY":
      return rule.monthDay ? `on the ${ordinal(rule.monthDay)} of every month` : "every month";
    case "DATES":
      return `on ${rule.dates?.length ?? rule.total ?? "chosen"} chosen dates`;
    case "DAYS_OF_WEEK": {
      const days = [...new Set(rule.weekdays ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      if (days.length === 0 || days.length === 7) return "every day";
      if (days.length === 1) return `every ${WEEKDAY_LONG[days[0]]}`;
      const names = days.map((d) => WEEKDAY_SHORT[d]);
      return `every ${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
    }
  }
}
