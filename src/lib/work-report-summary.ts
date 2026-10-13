/**
 * The numbers and plain-language highlights of a work report. Pure, so it's
 * unit tested and shared by the page and the PDF.
 */

export interface ReportTask {
  ref: string;
  title: string;
  role: "LEAD" | "FOLLOWER";
  status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE";
  priority: string;
  assignedBy: string;
  assignedAt: string;
  dueAt: string;
  /** First handed in (or completed), if ever. */
  deliveredAt: string | null;
  completedAt: string | null;
  /** true: delivered by the deadline · false: late, or overdue and still open · null: not due yet / no deadline passed. */
  onTime: boolean | null;
}

export interface ReportSubmission {
  status: "SUBMITTED" | "ACCEPTED" | "CHANGES_REQUESTED";
  task: string;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface WorkReportInput {
  generatedAt: string;
  person: {
    name: string;
    employeeCode: string;
    email: string;
    title: string | null;
    role: string;
    department: string | null;
    reportsTo: string[];
    status: string;
    joinedAt: string;
    lastDay: string | null;
  };
  period: { from: string; to: string };
  tasks: ReportTask[];
  submissions: ReportSubmission[];
  progressUpdates: number;
  comments: number;
  updateRequests: { received: number; answered: number };
  meetings: number;
  recognitions: { kind: "KUDOS" | "AWARD"; badge: string; title: string | null; message: string; from: string; at: string }[];
  now: string;
}

export interface WorkReportData extends Omit<WorkReportInput, "now"> {
  stats: {
    total: number;
    completed: number;
    open: number;
    inReview: number;
    overdue: number;
    led: number;
    onTime: number;
    late: number;
    /** % of tasks with a verdict that were delivered on time; null when none had one. */
    onTimeRate: number | null;
    submissions: number;
    accepted: number;
    sentBack: number;
    /** % of reviewed tasks accepted on the first submission. */
    firstTimeAcceptance: number | null;
    days: number;
  };
  highlights: string[];
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null);

export function summarise(input: WorkReportInput): WorkReportData {
  const { tasks, submissions } = input;
  const now = new Date(input.now).getTime();
  const completed = tasks.filter((t) => t.status === "DONE").length;
  const inReview = tasks.filter((t) => t.status === "IN_REVIEW").length;
  const open = tasks.length - completed;
  const overdue = tasks.filter((t) => t.status !== "DONE" && t.status !== "IN_REVIEW" && new Date(t.dueAt).getTime() < now).length;
  const onTime = tasks.filter((t) => t.onTime === true).length;
  const late = tasks.filter((t) => t.onTime === false).length;
  const accepted = submissions.filter((s) => s.status === "ACCEPTED").length;
  const sentBack = submissions.filter((s) => s.status === "CHANGES_REQUESTED").length;
  const reviewedTasks = new Map<string, ReportSubmission[]>();
  for (const s of [...submissions].reverse()) reviewedTasks.set(s.task, [...(reviewedTasks.get(s.task) ?? []), s]);
  const firstReviewed = [...reviewedTasks.values()].map((list) => list.find((s) => s.status !== "SUBMITTED")).filter(Boolean);
  const firstTime = firstReviewed.filter((s) => s!.status === "ACCEPTED").length;
  const days = Math.max(1, Math.round((new Date(input.period.to).getTime() - new Date(input.period.from).getTime()) / 86_400_000));

  const stats = {
    total: tasks.length,
    completed,
    open,
    inReview,
    overdue,
    led: tasks.filter((t) => t.role === "LEAD").length,
    onTime,
    late,
    onTimeRate: pct(onTime, onTime + late),
    submissions: submissions.length,
    accepted,
    sentBack,
    firstTimeAcceptance: pct(firstTime, firstReviewed.length),
    days,
  };

  const highlights: string[] = [];
  if (stats.total === 0) highlights.push("No tasks were assigned in this period.");
  else {
    highlights.push(`Completed ${completed} of ${stats.total} task${stats.total === 1 ? "" : "s"} over ${days} day${days === 1 ? "" : "s"}${stats.led ? `, leading ${stats.led}` : ""}.`);
    if (stats.onTimeRate !== null) highlights.push(`${stats.onTimeRate}% delivered on time (${onTime} on time, ${late} late or overdue).`);
    if (stats.firstTimeAcceptance !== null) highlights.push(`${stats.firstTimeAcceptance}% of reviewed work was accepted on the first submission.`);
    if (overdue) highlights.push(`${overdue} task${overdue === 1 ? " is" : "s are"} past the deadline and still open.`);
    if (inReview) highlights.push(`${inReview} task${inReview === 1 ? " is" : "s are"} handed in and waiting for review.`);
  }
  if (input.updateRequests.received) {
    highlights.push(`Answered ${input.updateRequests.answered} of ${input.updateRequests.received} requests for an update; posted ${input.progressUpdates} progress update${input.progressUpdates === 1 ? "" : "s"}.`);
  }
  const awards = input.recognitions.filter((r) => r.kind === "AWARD");
  if (input.recognitions.length) {
    highlights.push(
      `Recognised ${input.recognitions.length} time${input.recognitions.length === 1 ? "" : "s"} by colleagues${awards.length ? `, including ${awards.map((a) => a.title).join(", ")}` : ""}.`,
    );
  }
  if (input.meetings) highlights.push(`Took part in ${input.meetings} meeting${input.meetings === 1 ? "" : "s"} arranged through the Workspace.`);

  const { now: _now, ...rest } = input;
  void _now;
  return { ...rest, stats, highlights };
}
