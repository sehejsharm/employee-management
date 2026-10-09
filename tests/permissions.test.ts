import { describe, expect, it } from "vitest";
import { canAssignTasks, canEditTask, canRequestUpdate, canViewTask, defaultGrants, type Actor } from "@/lib/permissions";

const actor = (role: Actor["role"], extra: Partial<Actor> = {}): Actor => ({
  id: role.toLowerCase(),
  role,
  status: "ACTIVE",
  canAssignTasks: false,
  canManageOrg: false,
  canManagePeople: false,
  ...extra,
});

const task = { createdById: "manager", assigneeIds: ["intern"] };

describe("permissions", () => {
  it("founders see and edit everything", () => {
    const f = actor("FOUNDER");
    expect(canViewTask(f, task)).toBe(true);
    expect(canEditTask(f, task)).toBe(true);
    expect(canAssignTasks(f)).toBe(true);
  });

  it("an intern sees only their own tasks", () => {
    expect(canViewTask(actor("INTERN"), task)).toBe(true);
    expect(canViewTask(actor("INTERN", { id: "other" }), task)).toBe(false);
    expect(canEditTask(actor("INTERN"), task)).toBe(false);
  });

  it("a manager sees their reporting line's work", () => {
    const lead = actor("MANAGER", { id: "lead" });
    expect(canViewTask(lead, task)).toBe(false);
    expect(canViewTask(lead, task, new Set(["intern"]))).toBe(true);
    expect(canRequestUpdate(lead, task, new Set(["intern"]))).toBe(true);
  });

  it("nobody requests an update from themselves", () => {
    expect(canRequestUpdate(actor("INTERN"), { createdById: "intern", assigneeIds: ["intern"] })).toBe(false);
  });

  it("management only assigns when granted", () => {
    expect(canAssignTasks(actor("MANAGER"))).toBe(false);
    expect(canAssignTasks(actor("MANAGER", { canAssignTasks: true }))).toBe(true);
    expect(defaultGrants("MANAGER").canAssignTasks).toBe(true);
    expect(defaultGrants("INTERN")).toEqual({ canAssignTasks: false, canManageOrg: false, canManagePeople: false });
  });
});
