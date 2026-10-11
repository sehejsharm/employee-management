import { describe, expect, it } from "vitest";
import { deadlineAlerts, reminderStage } from "@/lib/deadline-alerts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const now = new Date("2026-10-09T10:00:00Z");

function task(dueInMs: number, assignees = ["u1"], createdById = "boss") {
  return {
    id: "t1",
    number: 7,
    title: "Venue shortlist",
    dueAt: new Date(now.getTime() + dueInMs),
    createdById,
    assignees: assignees.map((userId) => ({ userId, user: { firstName: userId.toUpperCase() } })),
  };
}

describe("deadline reminder ladder", () => {
  it.each([
    [30 * HOUR, null],
    [24 * HOUR, "due24h"],
    [20 * HOUR, "due24h"],
    [12 * HOUR, "due12h"],
    [7 * HOUR, "due12h"],
    [6 * HOUR, "due6h"],
    [2 * HOUR, "due6h"],
    [1 * HOUR, "due1h"],
    [45 * MINUTE, "due1h"],
    [30 * MINUTE, "due30m"],
    [16 * MINUTE, "due30m"],
    [15 * MINUTE, "due15m"],
    [6 * MINUTE, "due15m"],
    [5 * MINUTE, "due5m"],
    [1 * MINUTE, "due5m"],
    [0, "overdue"],
    [-HOUR, "overdue"],
  ])("a deadline %i ms away is on rung %s", (ms, stage) => {
    expect(reminderStage(new Date(now.getTime() + ms), now)).toBe(stage);
  });

  it("sends nothing while the deadline is more than a day away", () => {
    expect(deadlineAlerts([task(30 * HOUR)], now)).toEqual([]);
  });

  it("reminds every assignee with a countdown and a nudge to submit", () => {
    const alerts = deadlineAlerts([task(30 * MINUTE, ["lead", "follower"])], now);
    expect(alerts.map((a) => a.userId)).toEqual(["lead", "follower"]);
    expect(alerts[0].kind).toBe("TASK_DUE_SOON");
    expect(alerts[0].title).toBe("T-7 is due in 30m");
    expect(alerts[0].body).toContain("submit your work");
    expect(alerts[0].dedupeKey).toMatch(/^due30m:t1:/);
  });

  it("gives each rung its own key, so every step of the ladder is delivered once", () => {
    const keys = [24 * HOUR, 12 * HOUR, 6 * HOUR, HOUR, 30 * MINUTE, 15 * MINUTE, 5 * MINUTE].map(
      (ms) => deadlineAlerts([task(ms)], now)[0].dedupeKey,
    );
    expect(new Set(keys).size).toBe(7);
  });

  it("flags overdue work to assignees and to whoever assigned it", () => {
    const alerts = deadlineAlerts([task(-HOUR, ["u1", "u2"])], now);
    expect(alerts.map((a) => a.userId).sort()).toEqual(["boss", "u1", "u2"]);
    expect(alerts.find((a) => a.userId === "boss")?.body).toContain("assigned to U1, U2");
  });

  it("does not double-notify a creator who is also the assignee", () => {
    expect(deadlineAlerts([task(-HOUR, ["boss"])], now)).toHaveLength(1);
  });

  it("re-arms reminders when the deadline moves", () => {
    const [a] = deadlineAlerts([task(20 * HOUR)], now);
    const [b] = deadlineAlerts([task(21 * HOUR)], now);
    expect(a.dedupeKey).not.toBe(b.dedupeKey);
  });

  it("can be scoped to one person", () => {
    expect(deadlineAlerts([task(-HOUR, ["u1", "u2"])], now, "u2").map((a) => a.userId)).toEqual(["u2"]);
  });
});
