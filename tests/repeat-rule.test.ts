import { describe, expect, it } from "vitest";
import { firstDue, nextDue, repeatLabel, seriesDueDates } from "@/lib/repeat-rule";

const TZ = "Asia/Kolkata";
// Wall-clock in Kolkata, as "Wed 26 Nov 18:00".
const show = (d: Date) =>
  d.toLocaleString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(",", "");

// Thu 26 Nov 2026, 6 PM IST.
const start = new Date("2026-11-26T12:30:00Z");

describe("repeat rules", () => {
  it("repeats on the chosen days of the week, keeping the time", () => {
    const rule = { frequency: "DAYS_OF_WEEK" as const, weekdays: [1, 4] }; // Mon & Thu
    expect(seriesDueDates(start, rule, 5, TZ).map(show)).toEqual([
      "Thu 26 Nov 18:00",
      "Mon 30 Nov 18:00",
      "Thu 3 Dec 18:00",
      "Mon 7 Dec 18:00",
      "Thu 10 Dec 18:00",
    ]);
  });

  it("moves a first deadline that falls on a skipped day to the next chosen day", () => {
    expect(show(firstDue(start, { frequency: "DAYS_OF_WEEK", weekdays: [2] }, TZ))).toBe("Tue 1 Dec 18:00");
  });

  it("repeats monthly on the same day, clamped to shorter months", () => {
    const jan31 = new Date("2027-01-31T12:30:00Z");
    expect(seriesDueDates(jan31, { frequency: "MONTHLY", monthDay: 31 }, 4, TZ).map(show)).toEqual([
      "Sun 31 Jan 18:00",
      "Sun 28 Feb 18:00",
      "Wed 31 Mar 18:00",
      "Fri 30 Apr 18:00",
    ]);
  });

  it("uses hand-picked dates as given, each with its own time", () => {
    const dates = [new Date("2026-12-01T04:30:00Z"), new Date("2026-12-09T12:30:00Z"), new Date("2027-01-15T08:30:00Z")];
    const rule = { frequency: "DATES" as const, dates };
    expect(seriesDueDates(dates[0], rule, 3, TZ).map(show)).toEqual(["Tue 1 Dec 10:00", "Wed 9 Dec 18:00", "Fri 15 Jan 14:00"]);
    expect(nextDue(dates[2], rule, TZ, 3)).toBeNull();
  });

  it("still does daily, weekday and weekly series", () => {
    expect(seriesDueDates(start, { frequency: "WEEKDAYS" }, 3, TZ).map(show)).toEqual(["Thu 26 Nov 18:00", "Fri 27 Nov 18:00", "Mon 30 Nov 18:00"]);
    expect(show(nextDue(start, { frequency: "WEEKLY" }, TZ)!)).toBe("Thu 3 Dec 18:00");
    expect(show(nextDue(start, { frequency: "DAILY" }, TZ)!)).toBe("Fri 27 Nov 18:00");
  });

  it("reads naturally", () => {
    expect(repeatLabel({ frequency: "DAYS_OF_WEEK", weekdays: [4, 1] })).toBe("every Mon & Thu");
    expect(repeatLabel({ frequency: "DAYS_OF_WEEK", weekdays: [5] })).toBe("every Friday");
    expect(repeatLabel({ frequency: "DAYS_OF_WEEK", weekdays: [0, 1, 3] })).toBe("every Mon, Wed & Sun");
    expect(repeatLabel({ frequency: "MONTHLY", monthDay: 1 })).toBe("on the 1st of every month");
    expect(repeatLabel({ frequency: "MONTHLY", monthDay: 22 })).toBe("on the 22nd of every month");
    expect(repeatLabel({ frequency: "DATES", dates: [start, start, start] })).toBe("on 3 chosen dates");
  });
});
