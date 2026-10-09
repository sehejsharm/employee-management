import { describe, expect, it } from "vitest";
import { dueBucket, dueState, formatCountdown, formatDue, startOfDayInZone } from "@/lib/time";
import { safeHttpUrl } from "@/lib/utils";
import { generateTemporaryPassword, isBcryptHash, passwordProblems } from "@/lib/auth/password";

const tz = "Asia/Kolkata";
const now = new Date("2026-10-09T06:30:00Z"); // 12:00 IST

describe("time", () => {
  it("formats deadlines in the viewer's zone", () => {
    expect(formatDue(new Date("2026-10-09T12:30:00Z"), tz, now)).toBe("Today, 6:00 PM");
    expect(formatDue(new Date("2026-10-10T04:30:00Z"), tz, now)).toBe("Tomorrow, 10:00 AM");
  });

  it("counts down and up", () => {
    expect(formatCountdown(new Date(now.getTime() + 3.5 * 3600_000), now)).toBe("in 3h 30m");
    expect(formatCountdown(new Date(now.getTime() - 2 * 86400_000), now)).toBe("2 days overdue");
  });

  it("classifies urgency", () => {
    expect(dueState(new Date(now.getTime() + 3600_000), "TODO", now)).toBe("urgent");
    expect(dueState(new Date(now.getTime() + 10 * 3600_000), "TODO", now)).toBe("soon");
    expect(dueState(new Date(now.getTime() - 1), "IN_PROGRESS", now)).toBe("overdue");
    expect(dueState(new Date(now.getTime() - 1), "DONE", now)).toBe("done");
  });

  it("buckets by calendar day in the zone, not UTC", () => {
    // 23:30 IST today is still "today", even though it's the 9th 18:00 UTC.
    expect(dueBucket(new Date("2026-10-09T18:00:00Z"), "TODO", tz, now)).toBe("today");
    expect(dueBucket(new Date("2026-10-09T18:31:00Z"), "TODO", tz, now)).toBe("tomorrow");
  });

  it("finds midnight in a zone", () => {
    expect(startOfDayInZone(now, tz).toISOString()).toBe("2026-10-08T18:30:00.000Z");
  });
});

describe("safety helpers", () => {
  it("only allows http(s) links", () => {
    expect(safeHttpUrl("https://docs.google.com/x")).toBe("https://docs.google.com/x");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
  });

  it("generates readable temporary passwords that pass the policy", () => {
    const p = generateTemporaryPassword();
    expect(p).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
    expect(p).not.toMatch(/[O0lI1]/);
  });

  it("recognises bcrypt hashes and weak passwords", () => {
    expect(isBcryptHash("$2b$12$snuQiXkZlMlP.a4CbEmFOOztFffBjGpSHyGY8j7nOg/QOrGDH7QJ6")).toBe(true);
    expect(isBcryptHash("plaintext")).toBe(false);
    expect(passwordProblems("short")).toContain("At least 10 characters");
    expect(passwordProblems("GoodPassw0rd")).toEqual([]);
  });
});
