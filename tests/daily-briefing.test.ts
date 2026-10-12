import { describe, expect, it } from "vitest";
import { briefingBucket, briefingHeadline, groupBriefing } from "@/lib/daily-briefing";

const tz = "Asia/Kolkata";
// 10:00 IST on Mon 12 Oct 2026.
const now = new Date("2026-10-12T04:30:00Z");
const at = (iso: string) => new Date(iso);

describe("daily briefing", () => {
  it("buckets by calendar day in the viewer's time zone", () => {
    expect(briefingBucket(at("2026-10-12T03:00:00Z"), tz, now)).toBe("overdue");
    expect(briefingBucket(at("2026-10-12T18:00:00Z"), tz, now)).toBe("today"); // 23:30 IST
    expect(briefingBucket(at("2026-10-12T19:00:00Z"), tz, now)).toBe("tomorrow"); // 00:30 IST on the 13th
    expect(briefingBucket(at("2026-10-14T06:00:00Z"), tz, now)).toBe("dayAfter");
    expect(briefingBucket(at("2026-10-16T06:00:00Z"), tz, now)).toBe("week");
    expect(briefingBucket(at("2026-10-25T06:00:00Z"), tz, now)).toBe("later");
  });

  it("groups in day order and summarises in one line", () => {
    const task = (id: string, dueAt: string) => ({ id, number: 1, title: id, dueAt, priority: "MEDIUM", isLead: false });
    const groups = groupBriefing(
      [task("b", "2026-10-13T06:00:00Z"), task("a", "2026-10-11T06:00:00Z"), task("c", "2026-10-12T10:00:00Z"), task("d", "2026-10-12T12:00:00Z")],
      tz,
      now,
    );
    expect(groups.map((g) => g.bucket)).toEqual(["overdue", "today", "tomorrow"]);
    expect(groups[1].tasks.map((t) => t.id)).toEqual(["c", "d"]);
    expect(briefingHeadline(groups, 1, 2)).toBe("1 overdue · 2 due today · 1 tomorrow · 1 submission to review · 2 updates requested");
    expect(briefingHeadline([], 0, 0)).toBe("Nothing on your plate right now.");
  });
});
