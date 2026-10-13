import { describe, expect, it, vi } from "vitest";
import { summarise, type ReportTask } from "@/lib/work-report-summary";

vi.mock("server-only", () => ({}));

const task = (ref: string, over: Partial<ReportTask>): ReportTask => ({
  ref,
  title: `Task ${ref}`,
  role: "FOLLOWER",
  status: "DONE",
  priority: "MEDIUM",
  assignedBy: "Aarav Mehta",
  assignedAt: "2026-09-01T00:00:00Z",
  dueAt: "2026-09-10T00:00:00Z",
  deliveredAt: "2026-09-09T00:00:00Z",
  completedAt: "2026-09-11T00:00:00Z",
  onTime: true,
  ...over,
});

const input = {
  generatedAt: "2026-10-13T00:00:00Z",
  person: { name: "Tara Bose", employeeCode: "FR-0012", email: "interns@focusrealm.com", title: "Intern", role: "Intern", department: "Founder's Office", reportsTo: ["Aarav Mehta"], status: "ACTIVE", joinedAt: "2026-09-01T00:00:00Z", lastDay: null },
  period: { from: "2026-09-01T00:00:00Z", to: "2026-10-13T00:00:00Z" },
  tasks: [
    task("T-1", { role: "LEAD" }),
    task("T-2", { deliveredAt: "2026-09-12T00:00:00Z", onTime: false }),
    task("T-3", { status: "IN_PROGRESS", deliveredAt: null, completedAt: null, dueAt: "2026-10-01T00:00:00Z", onTime: false }),
    task("T-4", { status: "TODO", deliveredAt: null, completedAt: null, dueAt: "2026-11-01T00:00:00Z", onTime: null }),
  ],
  submissions: [
    { status: "ACCEPTED" as const, task: "T-2 · b", reviewNote: null, reviewedBy: "Aarav Mehta", reviewedAt: null },
    { status: "CHANGES_REQUESTED" as const, task: "T-2 · b", reviewNote: "Add sources", reviewedBy: "Aarav Mehta", reviewedAt: null },
    { status: "ACCEPTED" as const, task: "T-1 · a", reviewNote: "Great", reviewedBy: "Aarav Mehta", reviewedAt: null },
  ],
  progressUpdates: 5,
  comments: 3,
  updateRequests: { received: 2, answered: 2 },
  meetings: 4,
  recognitions: [{ kind: "AWARD" as const, badge: "Star performer", title: "Intern of the Month", message: "Turned the teardown around in a day.", from: "Aarav Mehta", at: "2026-10-01T00:00:00Z" }],
  now: "2026-10-13T00:00:00Z",
};

describe("work report", () => {
  it("counts delivery, punctuality and first-time acceptance", () => {
    const r = summarise(input);
    expect(r.stats).toMatchObject({ total: 4, completed: 2, open: 2, overdue: 1, led: 1, onTime: 1, late: 2, onTimeRate: 33, firstTimeAcceptance: 50, days: 42 });
    expect(r.highlights[0]).toBe("Completed 2 of 4 tasks over 42 days, leading 1.");
    expect(r.highlights.join(" ")).toContain("Took part in 4 meetings");
    expect(r.highlights.join(" ")).toContain("Recognised 1 time by colleagues, including Intern of the Month.");
    expect(r).not.toHaveProperty("now");
  });

  it("renders a PDF", async () => {
    const { workReportPdf } = await import("@/lib/work-report-pdf");
    const bytes = await workReportPdf(summarise(input), { tz: "Asia/Kolkata" });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(2000);
  });
});
