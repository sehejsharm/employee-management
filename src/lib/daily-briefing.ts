import { dayDiff } from "@/lib/time";

/**
 * The once-a-day summary shown the first time someone opens the workspace on
 * a new calendar day (in their own time zone): what's late, what's due today,
 * tomorrow, the day after, and the rest of the week.
 */

export type BriefingBucket = "overdue" | "today" | "tomorrow" | "dayAfter" | "week" | "later";

export const BRIEFING_ORDER: BriefingBucket[] = ["overdue", "today", "tomorrow", "dayAfter", "week", "later"];

export const BRIEFING_LABEL: Record<BriefingBucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  tomorrow: "Due tomorrow",
  dayAfter: "Day after tomorrow",
  week: "Later this week",
  later: "Coming up",
};

export interface BriefingTask {
  id: string;
  number: number;
  title: string;
  dueAt: string;
  priority: string;
  isLead: boolean;
}

export interface Briefing {
  notificationId: string | null;
  day: string;
  /** The time zone the days were counted in, for showing due times. */
  tz: string;
  groups: { bucket: BriefingBucket; tasks: BriefingTask[] }[];
  /** Work handed in to you that's waiting for your review. */
  toReview: { id: string; number: number; title: string }[];
  /** Tasks where someone asked you for an update. */
  updatesRequested: number;
  headline: string;
}

export function briefingBucket(dueAt: Date, tz: string, now: Date): BriefingBucket {
  if (dueAt.getTime() < now.getTime()) return "overdue";
  const diff = dayDiff(dueAt, now, tz);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === 2) return "dayAfter";
  if (diff < 7) return "week";
  return "later";
}

export function groupBriefing(tasks: BriefingTask[], tz: string, now: Date) {
  const map = new Map<BriefingBucket, BriefingTask[]>();
  for (const t of [...tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
    const b = briefingBucket(new Date(t.dueAt), tz, now);
    map.set(b, [...(map.get(b) ?? []), t]);
  }
  return BRIEFING_ORDER.filter((b) => map.has(b)).map((bucket) => ({ bucket, tasks: map.get(bucket)! }));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One line for the inbox: "2 overdue · 3 due today · 1 tomorrow". */
export function briefingHeadline(groups: Briefing["groups"], toReview: number, updatesRequested: number) {
  const count = (b: BriefingBucket) => groups.find((g) => g.bucket === b)?.tasks.length ?? 0;
  const parts = [
    count("overdue") && `${count("overdue")} overdue`,
    count("today") && `${count("today")} due today`,
    count("tomorrow") && `${count("tomorrow")} tomorrow`,
    count("dayAfter") && `${count("dayAfter")} the day after`,
    count("week") && `${count("week")} later this week`,
    toReview && `${plural(toReview, "submission")} to review`,
    updatesRequested && `${plural(updatesRequested, "update")} requested`,
  ].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return count("later") ? "Nothing due this week — a clear runway." : "Nothing on your plate right now.";
}
