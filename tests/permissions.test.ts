import { describe, expect, it } from "vitest";
import {
  NO_GRANTS,
  assigneeProblem,
  canAssignTasks,
  canChangeStatus,
  canContribute,
  canEditTask,
  canManageVisibilityGrants,
  canRequestUpdate,
  canViewTask,
  defaultGrants,
  taskAccess,
  visibilityGrantProblem,
  type Actor,
  type GrantedOwnerIds,
} from "@/lib/permissions";
import { grantedWorkWhere, notificationVisibilityWhere, taskVisibilityWhere } from "@/lib/tasks/queries";
import { deadlineAlerts } from "@/lib/deadline-alerts";

type Role = Actor["role"];

const actor = (id: string, role: Role, extra: Partial<Actor> = {}): Actor => ({
  id,
  role,
  status: "ACTIVE",
  canAssignTasks: false,
  canManageOrg: false,
  canManagePeople: false,
  ...extra,
});

/* The cast. Reporting line (which grants nothing any more): mgr manages emp, asha and rohan. */
const founder = actor("founder", "FOUNDER");
const founder2 = actor("founder2", "FOUNDER");
const mgr = actor("mgr", "MANAGER", { canAssignTasks: true, canManageOrg: true, canManagePeople: true });
const emp = actor("emp", "EMPLOYEE");
const asha = actor("asha", "INTERN");
const rohan = actor("rohan", "INTERN");
const tara = actor("tara", "INTERN");
const people = [founder, founder2, mgr, emp, asha, rohan, tara];
const roleOf = (id: string) => people.find((p) => p.id === id)!.role;

/** A task row as the database would return it, with the assignees' current roles. */
interface Row {
  id: string;
  createdById: string;
  archivedAt: Date | null;
  assignees: { userId: string; user: { role: Role } }[];
}
const row = (id: string, createdById: string, assigneeIds: string[], archived = false): Row => ({
  id,
  createdById,
  archivedAt: archived ? new Date() : null,
  assignees: assigneeIds.map((userId) => ({ userId, user: { role: roleOf(userId) } })),
});
const access = (r: Row) => taskAccess(r);
const grants = (...ids: string[]): GrantedOwnerIds => new Set(ids);

describe("who sees what", () => {
  const rohansTask = row("t1", "founder", ["rohan"]);
  const pairTask = row("t2", "mgr", ["rohan", "tara"]);
  const founderTaskWithRohan = row("t3", "founder", ["founder", "rohan"]);
  const founderOwnTask = row("t4", "founder", ["founder"]);
  const ashasOwn = row("t5", "asha", ["asha"]);
  const createdByRohanForEmp = row("t6", "rohan", ["emp"]);

  it("founders see every task, founders' own work included", () => {
    for (const t of [rohansTask, pairTask, founderTaskWithRohan, founderOwnTask, ashasOwn]) {
      expect(canViewTask(founder, access(t), NO_GRANTS)).toBe(true);
      expect(canViewTask(founder2, access(t), NO_GRANTS)).toBe(true);
    }
  });

  it("everyone sees what they created or are on", () => {
    expect(canViewTask(rohan, access(rohansTask), NO_GRANTS)).toBe(true);
    expect(canViewTask(tara, access(pairTask), NO_GRANTS)).toBe(true);
    expect(canViewTask(mgr, access(pairTask), NO_GRANTS)).toBe(true); // creator
    expect(canViewTask(asha, access(ashasOwn), NO_GRANTS)).toBe(true);
  });

  it("no intern sees another intern's work until a founder allows it", () => {
    expect(canViewTask(asha, access(rohansTask), NO_GRANTS)).toBe(false);
    expect(canViewTask(asha, access(pairTask), NO_GRANTS)).toBe(false);
    expect(canViewTask(rohan, access(ashasOwn), NO_GRANTS)).toBe(false);
  });

  it("a founder's grant lets Asha see Rohan's tasks", () => {
    expect(canViewTask(asha, access(rohansTask), grants("rohan"))).toBe(true);
    expect(canViewTask(asha, access(pairTask), grants("rohan"))).toBe(true);
    // Only tasks Rohan is on: something he created for someone else isn't his work.
    expect(canViewTask(asha, access(createdByRohanForEmp), grants("rohan"))).toBe(false);
  });

  it("a grant never covers a task a founder is on", () => {
    expect(canViewTask(asha, access(founderTaskWithRohan), grants("rohan"))).toBe(false);
    expect(canViewTask(asha, access(founderOwnTask), grants("rohan", "founder"))).toBe(false);
    // ...but the non-founders on it, and its non-founder creator, still see it.
    expect(canViewTask(rohan, access(founderTaskWithRohan), NO_GRANTS)).toBe(true);
    const createdByEmpWithFounder = row("t7", "emp", ["founder", "tara"]);
    expect(canViewTask(emp, access(createdByEmpWithFounder), NO_GRANTS)).toBe(true);
    expect(canViewTask(tara, access(createdByEmpWithFounder), NO_GRANTS)).toBe(true);
    expect(canViewTask(asha, access(createdByEmpWithFounder), grants("tara", "emp"))).toBe(false);
  });

  it("revoking a grant hides the work again", () => {
    const before = grants("rohan");
    expect(canViewTask(asha, access(rohansTask), before)).toBe(true);
    expect(canViewTask(asha, access(rohansTask), NO_GRANTS)).toBe(false);
  });

  it("managers no longer see their reporting line's work", () => {
    // mgr manages emp, asha and rohan; that grants nothing.
    expect(canViewTask(mgr, access(rohansTask), NO_GRANTS)).toBe(false);
    expect(canViewTask(mgr, access(ashasOwn), NO_GRANTS)).toBe(false);
    expect(canViewTask(mgr, access(founderOwnTask), NO_GRANTS)).toBe(false);
  });

  it("permission flags grant no visibility", () => {
    const powerful = actor("powerful", "MANAGER", { canAssignTasks: true, canManageOrg: true, canManagePeople: true });
    expect(canViewTask(powerful, access(rohansTask), NO_GRANTS)).toBe(false);
    expect(canViewTask(powerful, access(ashasOwn), NO_GRANTS)).toBe(false);
  });

  it("founder status is read from the assignees' current roles", () => {
    const promoted = { createdById: "mgr", assignees: [{ userId: "emp", user: { role: "FOUNDER" as Role } }] };
    expect(taskAccess(promoted).founderAssigned).toBe(true);
    expect(canViewTask(asha, taskAccess(promoted), grants("emp"))).toBe(false);
    expect(taskAccess(row("x", "mgr", ["emp"])).founderAssigned).toBe(false);
  });
});

describe("contributing, editing and requesting updates", () => {
  const t = row("t", "mgr", ["rohan", "tara"]);
  const ctx = access(t);

  it("founders, the creator and assignees can contribute", () => {
    expect(canContribute(founder, ctx)).toBe(true);
    expect(canContribute(mgr, ctx)).toBe(true);
    expect(canContribute(rohan, ctx)).toBe(true);
    expect(canContribute(tara, ctx)).toBe(true);
    expect(canContribute(emp, ctx)).toBe(false);
  });

  it("a grant is view only", () => {
    const g = grants("rohan");
    expect(canViewTask(asha, ctx, g)).toBe(true);
    expect(canContribute(asha, ctx)).toBe(false);
    expect(canChangeStatus(asha, ctx)).toBe(false);
    expect(canEditTask(asha, ctx)).toBe(false);
    expect(canRequestUpdate(asha, ctx)).toBe(false);
  });

  it("only founders and the creator edit", () => {
    expect(canEditTask(founder, ctx)).toBe(true);
    expect(canEditTask(mgr, ctx)).toBe(true);
    expect(canEditTask(rohan, ctx)).toBe(false);
  });

  it("assignees can move the status; others can't", () => {
    expect(canChangeStatus(rohan, ctx)).toBe(true);
    expect(canChangeStatus(emp, ctx)).toBe(false);
  });

  it("only founders and the creator ask for updates", () => {
    expect(canRequestUpdate(founder, ctx)).toBe(true);
    expect(canRequestUpdate(mgr, ctx)).toBe(true);
    expect(canRequestUpdate(rohan, ctx)).toBe(false);
    // A manager over the assignees doesn't, any more.
    const byFounder = access(row("t2", "founder", ["rohan"]));
    expect(canRequestUpdate(mgr, byFounder)).toBe(false);
  });

  it("nobody requests an update from themselves", () => {
    expect(canRequestUpdate(asha, access(row("t3", "asha", ["asha"])))).toBe(false);
    expect(canRequestUpdate(founder, access(row("t4", "founder", ["founder"])))).toBe(false);
  });
});

describe("putting people on tasks", () => {
  const f = { id: "founder", role: "FOUNDER" as Role };
  const r = { id: "rohan", role: "INTERN" as Role };

  it("only founders add founders, whatever else the person may do", () => {
    expect(assigneeProblem(mgr, [f])).toMatch(/Only founders/);
    expect(assigneeProblem(actor("x", "MANAGER", { canAssignTasks: true, canManagePeople: true }), [r, f])).toMatch(/Only founders/);
    expect(assigneeProblem(founder, [f])).toBeNull();
    expect(assigneeProblem(founder, [{ id: "founder2", role: "FOUNDER" }, r])).toBeNull();
  });

  it("people without assigning rights can only add themselves", () => {
    expect(assigneeProblem(asha, [{ id: "asha", role: "INTERN" }])).toBeNull();
    expect(assigneeProblem(asha, [r])).toMatch(/for yourself/);
    expect(assigneeProblem(mgr, [r])).toBeNull();
  });

  it("people already on a task aren't re-checked (the action passes only newcomers)", () => {
    expect(assigneeProblem(asha, [])).toBeNull();
  });
});

describe("visibility grants", () => {
  const p = (id: string, role: Role, status: Actor["status"] = "ACTIVE") => ({ id, role, status });

  it("only founders manage them", () => {
    expect(canManageVisibilityGrants(founder)).toBe(true);
    expect(canManageVisibilityGrants(mgr)).toBe(false); // canManagePeople included
    expect(canManageVisibilityGrants(asha)).toBe(false);
  });

  it("neither side may be a founder, and nobody is granted themselves", () => {
    expect(visibilityGrantProblem(p("asha", "INTERN"), p("rohan", "INTERN"))).toBeNull();
    expect(visibilityGrantProblem(p("mgr", "MANAGER"), p("emp", "EMPLOYEE"))).toBeNull();
    expect(visibilityGrantProblem(p("asha", "INTERN"), p("mgr", "MANAGER"))).toBeNull();
    expect(visibilityGrantProblem(p("asha", "INTERN"), p("founder", "FOUNDER"))).not.toBeNull();
    expect(visibilityGrantProblem(p("founder", "FOUNDER"), p("rohan", "INTERN"))).not.toBeNull();
    expect(visibilityGrantProblem(p("asha", "INTERN"), p("asha", "INTERN"))).not.toBeNull();
  });

  it("people who have left can't be part of a new grant", () => {
    expect(visibilityGrantProblem(p("asha", "INTERN", "INACTIVE"), p("rohan", "INTERN"))).not.toBeNull();
    expect(visibilityGrantProblem(p("asha", "INTERN"), p("rohan", "INTERN", "INACTIVE"))).not.toBeNull();
    expect(visibilityGrantProblem(p("asha", "INTERN", "ON_LEAVE"), p("rohan", "INTERN"))).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The predicate and the database filter must agree, exactly.                 */
/* -------------------------------------------------------------------------- */

/**
 * A tiny evaluator for the Prisma filter shapes the visibility filters use. It
 * throws on anything it doesn't know, so a filter growing a new shape fails
 * here instead of silently passing.
 */
type Where = Record<string, unknown>;

function scalar(cond: unknown, value: unknown): boolean {
  if (cond === null || typeof cond !== "object") return value === cond;
  return Object.entries(cond as Where).every(([op, arg]) => {
    if (op === "equals") return value === arg;
    if (op === "not") return value !== arg;
    if (op === "in") return (arg as unknown[]).includes(value);
    throw new Error(`unsupported scalar operator ${op}`);
  });
}

function assigneeMatches(where: Where, a: Row["assignees"][number]): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "userId") return scalar(cond, a.userId);
    if (key === "user") {
      return Object.entries(cond as Where).every(([k, c]) => {
        if (k === "role") return scalar(c, a.user.role);
        throw new Error(`unsupported user filter ${k}`);
      });
    }
    throw new Error(`unsupported assignee filter ${key}`);
  });
}

function taskMatches(where: Where, t: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    switch (key) {
      case "AND":
        return (cond as Where[]).every((w) => taskMatches(w, t));
      case "OR":
        return (cond as Where[]).some((w) => taskMatches(w, t));
      case "createdById":
        return scalar(cond, t.createdById);
      case "archivedAt":
        return scalar(cond, t.archivedAt);
      case "assignees":
        return Object.entries(cond as Where).every(([op, w]) => {
          if (op === "some") return t.assignees.some((a) => assigneeMatches(w as Where, a));
          if (op === "none") return !t.assignees.some((a) => assigneeMatches(w as Where, a));
          if (op === "every") return t.assignees.every((a) => assigneeMatches(w as Where, a));
          throw new Error(`unsupported relation operator ${op}`);
        });
      default:
        throw new Error(`unsupported task filter ${key}`);
    }
  });
}

interface NotificationRow {
  userId: string;
  taskId: string | null;
  task: Row | null;
}

function notificationMatches(where: Where, n: NotificationRow): boolean {
  return Object.entries(where).every(([key, cond]) => {
    switch (key) {
      case "AND":
        return (cond as Where[]).every((w) => notificationMatches(w, n));
      case "OR":
        return (cond as Where[]).some((w) => notificationMatches(w, n));
      case "userId":
        return scalar(cond, n.userId);
      case "taskId":
        return scalar(cond, n.taskId);
      case "task":
        return !!n.task && taskMatches(cond as Where, n.task);
      default:
        throw new Error(`unsupported notification filter ${key}`);
    }
  });
}

/** Every combination of creator and assignees (up to three) among the cast, founders included. */
function allTasks(): Row[] {
  const ids = people.map((p) => p.id);
  const assigneeSets: string[][] = [[]];
  for (let i = 0; i < ids.length; i++) {
    assigneeSets.push([ids[i]]);
    for (let j = i + 1; j < ids.length; j++) {
      assigneeSets.push([ids[i], ids[j]]);
      for (let k = j + 1; k < ids.length; k++) assigneeSets.push([ids[i], ids[j], ids[k]]);
    }
  }
  const out: Row[] = [];
  for (const creator of ids) for (const set of assigneeSets) out.push(row(`${creator}:${set.join(",")}`, creator, set));
  return out;
}

const grantSets: GrantedOwnerIds[] = [NO_GRANTS, grants("rohan"), grants("rohan", "tara"), grants("emp", "mgr"), grants("asha", "rohan", "tara", "emp", "mgr")];

/** The policy, written out independently of the implementation. */
function policy(viewer: Actor, t: Row, granted: GrantedOwnerIds) {
  if (viewer.role === "FOUNDER") return true;
  if (t.createdById === viewer.id) return true;
  if (t.assignees.some((a) => a.userId === viewer.id)) return true;
  if (t.assignees.some((a) => a.user.role === "FOUNDER")) return false;
  return t.assignees.some((a) => granted.has(a.userId));
}

describe("canViewTask and taskVisibilityWhere agree", () => {
  const tasks = allTasks();

  it("over every role, creator, assignee set, founder assignee and grant", () => {
    let checked = 0;
    let visibleViaGrant = 0;
    for (const viewer of people) {
      for (const granted of viewer.role === "FOUNDER" ? [NO_GRANTS] : grantSets) {
        // A viewer's grants never include themselves or a founder (the loader filters those).
        const g = new Set([...granted].filter((id) => id !== viewer.id && roleOf(id) !== "FOUNDER"));
        const where = taskVisibilityWhere(viewer, g) as Where;
        for (const t of tasks) {
          const expected = policy(viewer, t, g);
          expect(canViewTask(viewer, access(t), g), `${viewer.id} on ${t.id}`).toBe(expected);
          expect(taskMatches(where, t), `filter: ${viewer.id} on ${t.id}`).toBe(expected);
          if (expected && !policy(viewer, t, NO_GRANTS)) visibleViaGrant++;
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
    expect(visibleViaGrant).toBeGreaterThan(0);
  });

  it("the founders' filter is everything", () => {
    expect(taskVisibilityWhere(founder, NO_GRANTS)).toEqual({});
  });

  it("the 'Shared with me' scope never shows anything the viewer can't see", () => {
    for (const viewer of people.filter((p) => p.role !== "FOUNDER")) {
      for (const granted of grantSets) {
        const g = new Set([...granted].filter((id) => id !== viewer.id));
        if (!g.size) continue;
        const where = grantedWorkWhere(g) as Where;
        for (const t of tasks) {
          if (taskMatches(where, t)) expect(canViewTask(viewer, access(t), g)).toBe(true);
        }
      }
    }
  });

  it("notifications are filtered by the same rule, and archived tasks drop out", () => {
    for (const viewer of people) {
      const g = viewer.role === "FOUNDER" ? NO_GRANTS : grants("rohan");
      const where = notificationVisibilityWhere(viewer, g) as Where;
      expect(notificationMatches(where, { userId: viewer.id, taskId: null, task: null })).toBe(true);
      expect(notificationMatches(where, { userId: "someone-else", taskId: null, task: null })).toBe(false);
      for (const t of tasks.slice(0, 400)) {
        const n = { userId: viewer.id, taskId: t.id, task: t };
        expect(notificationMatches(where, n)).toBe(canViewTask(viewer, access(t), g));
        const archived = { ...t, archivedAt: new Date() };
        expect(notificationMatches(where, { ...n, task: archived })).toBe(false);
      }
    }
  });
});

describe("deadline reminders only go to people who can see the task", () => {
  it("recipients are always the creator or an assignee", () => {
    const now = new Date("2026-10-10T10:00:00Z");
    const tasks = allTasks()
      .filter((t) => t.assignees.length)
      .slice(0, 300)
      .map((t, i) => ({
        id: t.id,
        number: i + 1,
        title: "Task",
        dueAt: new Date(now.getTime() + (i % 3 === 0 ? -3600_000 : 3600_000)),
        createdById: t.createdById,
        assignees: t.assignees.map((a) => ({ userId: a.userId, user: { firstName: a.userId } })),
        row: t,
      }));
    const alerts = deadlineAlerts(tasks, now);
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      const t = tasks.find((x) => x.id === a.taskId)!;
      expect(canViewTask({ id: a.userId, role: roleOf(a.userId) }, access(t.row), NO_GRANTS)).toBe(true);
    }
  });
});

describe("account grants", () => {
  it("founders hold every permission; management only assigns when granted", () => {
    expect(canAssignTasks(founder)).toBe(true);
    expect(canAssignTasks(actor("m", "MANAGER"))).toBe(false);
    expect(canAssignTasks(actor("m", "MANAGER", { canAssignTasks: true }))).toBe(true);
    expect(defaultGrants("MANAGER").canAssignTasks).toBe(true);
    expect(defaultGrants("INTERN")).toEqual({ canAssignTasks: false, canManageOrg: false, canManagePeople: false });
  });
});
