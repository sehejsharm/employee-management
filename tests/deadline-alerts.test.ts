import { describe, expect, it } from "vitest";
import { deadlineAlerts } from "@/lib/deadline-alerts";

const HOUR = 3600_000;
const now = new Date("2026-10-09T10:00:00Z");

function task(dueInHours: number, assignees = ["u1"], createdById = "boss") {
  return {
    id: "t1",
    number: 7,
    title: "Venue shortlist",
    dueAt: new Date(now.getTime() + dueInHours * HOUR),
    createdById,
    assignees: assignees.map((userId) => ({ userId, user: { firstName: userId.toUpperCase() } })),
  };
}

describe("deadline reminders", () => {
  it("sends the 24-hour reminder", () => {
    const [a] = deadlineAlerts([task(20)], now);
    expect(a.kind).toBe("TASK_DUE_SOON");
    expect(a.title).toBe("T-7 is due within a day");
    expect(a.dedupeKey).toMatch(/^due24:t1:/);
  });

  it("sends the 2-hour reminder with a countdown", () => {
    const [a] = deadlineAlerts([task(1.5)], now);
    expect(a.title).toBe("T-7 is due in 1h 30m");
    expect(a.dedupeKey).toMatch(/^due2:t1:/);
  });

  it("flags overdue work to assignees and to whoever assigned it", () => {
    const alerts = deadlineAlerts([task(-1, ["u1", "u2"])], now);
    expect(alerts.map((a) => a.userId).sort()).toEqual(["boss", "u1", "u2"]);
    expect(alerts.find((a) => a.userId === "boss")?.body).toContain("assigned to U1, U2");
  });

  it("does not double-notify a creator who is also the assignee", () => {
    expect(deadlineAlerts([task(-1, ["boss"])], now)).toHaveLength(1);
  });

  it("re-arms reminders when the deadline moves", () => {
    const [a] = deadlineAlerts([task(20)], now);
    const [b] = deadlineAlerts([task(21)], now);
    expect(a.dedupeKey).not.toBe(b.dedupeKey);
  });

  it("can be scoped to one person", () => {
    expect(deadlineAlerts([task(-1, ["u1", "u2"])], now, "u2").map((a) => a.userId)).toEqual(["u2"]);
  });
});
