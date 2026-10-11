import { describe, expect, it } from "vitest";
import {
  canAssignTasks,
  canContribute,
  canEditTask,
  canRequestUpdate,
  canReviewWork,
  canSubmitWork,
  canViewTask,
  defaultGrants,
  type Actor,
} from "@/lib/permissions";

const actor = (role: Actor["role"], extra: Partial<Actor> = {}): Actor => ({
  id: role.toLowerCase(),
  role,
  status: "ACTIVE",
  canAssignTasks: false,
  canManageOrg: false,
  canManagePeople: false,
  ...extra,
});

const task = { createdById: "manager", assigneeIds: ["intern"], involvesFounder: false };
const foundersTask = { createdById: "founder", assigneeIds: ["founder", "intern"], involvesFounder: true };

describe("permissions", () => {
  it("founders see and edit everything", () => {
    const f = actor("FOUNDER");
    expect(canViewTask(f, task)).toBe(true);
    expect(canEditTask(f, task)).toBe(true);
    expect(canAssignTasks(f)).toBe(true);
    expect(canViewTask(actor("FOUNDER", { id: "other-founder" }), foundersTask)).toBe(true);
  });

  it("an intern sees only their own tasks", () => {
    expect(canViewTask(actor("INTERN"), task)).toBe(true);
    expect(canViewTask(actor("INTERN", { id: "other" }), task)).toBe(false);
    expect(canEditTask(actor("INTERN"), task)).toBe(false);
  });

  it("seeing a colleague's work needs clearance — being their manager isn't enough", () => {
    const lead = actor("MANAGER", { id: "lead" });
    expect(canViewTask(lead, task)).toBe(false);
    expect(canViewTask(lead, task, new Set(["intern"]))).toBe(true);
    expect(canRequestUpdate(lead, task, new Set(["intern"]))).toBe(true);
  });

  it("clearance is look-only", () => {
    const peer = actor("EMPLOYEE", { id: "peer" });
    expect(canViewTask(peer, task, new Set(["intern"]))).toBe(true);
    expect(canContribute(peer, task)).toBe(false);
    expect(canSubmitWork(peer, task)).toBe(false);
  });

  it("founders' work stays founders-only, whatever clearance someone holds", () => {
    const manager = actor("MANAGER", { id: "lead", canAssignTasks: true });
    expect(canViewTask(manager, foundersTask, new Set(["intern", "founder"]))).toBe(false);
    expect(canRequestUpdate(manager, foundersTask, new Set(["intern"]))).toBe(false);
    // …but the intern working on it alongside the founder sees it.
    expect(canViewTask(actor("INTERN"), foundersTask)).toBe(true);
  });

  it("only the people doing the work submit it; whoever assigned it reviews it", () => {
    expect(canSubmitWork(actor("INTERN"), task)).toBe(true);
    expect(canSubmitWork(actor("MANAGER"), task)).toBe(false);
    expect(canReviewWork(actor("MANAGER"), task)).toBe(true);
    expect(canReviewWork(actor("INTERN"), task)).toBe(false);
  });

  it("nobody requests an update from themselves", () => {
    expect(canRequestUpdate(actor("INTERN"), { createdById: "intern", assigneeIds: ["intern"], involvesFounder: false })).toBe(false);
  });

  it("management only assigns when granted", () => {
    expect(canAssignTasks(actor("MANAGER"))).toBe(false);
    expect(canAssignTasks(actor("MANAGER", { canAssignTasks: true }))).toBe(true);
    expect(defaultGrants("MANAGER").canAssignTasks).toBe(true);
    expect(defaultGrants("INTERN")).toEqual({ canAssignTasks: false, canManageOrg: false, canManagePeople: false });
  });
});
