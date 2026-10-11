import type { Role, EmploymentStatus } from "@/generated/prisma/enums";

/**
 * Who may do what. Pure functions over the signed-in user, shared by server
 * actions (enforcement) and components (hiding what you cannot use). The UI
 * hiding something is never the protection — every action re-checks here.
 */
export interface Actor {
  id: string;
  role: Role;
  status: EmploymentStatus;
  canAssignTasks: boolean;
  canManageOrg: boolean;
  canManagePeople: boolean;
}

export const ROLE_LABEL: Record<Role, string> = {
  FOUNDER: "Founder",
  MANAGER: "Management",
  EMPLOYEE: "Employee",
  INTERN: "Intern",
};

export const ROLE_ORDER: Role[] = ["FOUNDER", "MANAGER", "EMPLOYEE", "INTERN"];

export const STATUS_LABEL: Record<EmploymentStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  INACTIVE: "Former",
};

export const isFounder = (a: Pick<Actor, "role">) => a.role === "FOUNDER";

/** Founders and management: the "admin" side of the product. */
export const isLeader = (a: Pick<Actor, "role">) => a.role === "FOUNDER" || a.role === "MANAGER";

/** Assigning work to other people. Founders always; management when granted. */
export const canAssignTasks = (a: Actor) => isFounder(a) || a.canAssignTasks;

/** Editing the org chart: reporting lines, departments, who is active. */
export const canManageOrg = (a: Actor) => isFounder(a) || a.canManageOrg;

/** Adding people, resetting passwords, changing roles and grants. */
export const canManagePeople = (a: Actor) => isFounder(a) || a.canManagePeople;

/** Workspace settings: integrations, departments, audit log. */
export const canAdminister = (a: Actor) => isFounder(a) || a.canManagePeople;

/** Default grants for a role, applied when an account is created or its role changes. */
export function defaultGrants(role: Role) {
  return {
    canAssignTasks: role === "FOUNDER" || role === "MANAGER",
    canManageOrg: role === "FOUNDER",
    canManagePeople: role === "FOUNDER",
  };
}

/**
 * What the task rules need to know about a task. Build it with `taskAccess`
 * from the assignees' CURRENT roles, so a promotion to founder takes effect at
 * once.
 */
export interface TaskAccessContext {
  createdById: string;
  assigneeIds: string[];
  /** A founder is on the task, which makes it founders' work. */
  founderAssigned: boolean;
}

/** The ids of the people whose work a viewer has been allowed to see. Empty for founders. */
export type GrantedOwnerIds = ReadonlySet<string>;

export const NO_GRANTS: GrantedOwnerIds = new Set<string>();

type Who = Pick<Actor, "id" | "role">;

/** Builds the access context from a task's creator and its assignees with their roles. */
export function taskAccess(task: { createdById: string; assignees: { userId: string; user: { role: Role } }[] }): TaskAccessContext {
  return {
    createdById: task.createdById,
    assigneeIds: task.assignees.map((a) => a.userId),
    founderAssigned: task.assignees.some((a) => a.user.role === "FOUNDER"),
  };
}

/** The creator and the assignees: the people a task belongs to. */
function isParticipant(a: Who, task: Pick<TaskAccessContext, "createdById" | "assigneeIds">) {
  return task.createdById === a.id || task.assigneeIds.includes(a.id);
}

/**
 * Who can see a task, and everything on it. Founders see everything. Anyone
 * else sees a task they created or are assigned to, plus the tasks of people a
 * founder has allowed them to see, unless a founder is on the task: founders'
 * work stays with founders and the people on it. Reporting lines, departments
 * and permission flags grant nothing.
 *
 * `taskVisibilityWhere` in src/lib/tasks/queries.ts is the same rule as a
 * database filter; the two must always agree.
 */
export function canViewTask(a: Who, task: TaskAccessContext, grantedOwnerIds: GrantedOwnerIds) {
  if (isFounder(a)) return true;
  if (isParticipant(a, task)) return true;
  return !task.founderAssigned && task.assigneeIds.some((id) => grantedOwnerIds.has(id));
}

/** Title, description, deadline, assignees, priority. */
export function canEditTask(a: Who, task: Pick<TaskAccessContext, "createdById">) {
  return isFounder(a) || task.createdById === a.id;
}

/** Moving a task through its statuses. */
export function canChangeStatus(a: Who, task: Pick<TaskAccessContext, "createdById" | "assigneeIds">) {
  return canEditTask(a, task) || task.assigneeIds.includes(a.id);
}

/** Asking assignees for a progress update: founders and whoever created the task. */
export function canRequestUpdate(a: Who, task: Pick<TaskAccessContext, "createdById" | "assigneeIds">) {
  if (task.assigneeIds.length === 0) return false;
  if (task.assigneeIds.length === 1 && task.assigneeIds[0] === a.id) return false;
  return isFounder(a) || task.createdById === a.id;
}

/**
 * Commenting, attaching, posting progress and editing the checklist: founders,
 * the creator and the assignees. Being allowed to see someone's work is view
 * only, so this deliberately takes no grants.
 */
export function canContribute(a: Who, task: Pick<TaskAccessContext, "createdById" | "assigneeIds">) {
  return isFounder(a) || isParticipant(a, task);
}

/**
 * Why `actor` may not newly put these people on a task, or null when they may.
 * Only founders add founders: a founder on a task makes it founders' work.
 */
export function assigneeProblem(actor: Actor, added: { id: string; role: Role }[]) {
  if (!canAssignTasks(actor) && added.some((p) => p.id !== actor.id)) {
    return "You can create tasks for yourself. Ask a founder to give you assigning rights for others.";
  }
  if (!isFounder(actor) && added.some((p) => p.role === "FOUNDER")) {
    return "Only founders can put a founder on a task.";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Work visibility grants                                                     */
/* -------------------------------------------------------------------------- */

/** Only founders decide who may see whose work. */
export const canManageVisibilityGrants = (a: Pick<Actor, "role">) => isFounder(a);

type GrantParty = { id: string; role: Role; status: EmploymentStatus };

/** Why `viewer` may not be allowed to see `owner`'s work, or null when they may. */
export function visibilityGrantProblem(viewer: GrantParty, owner: GrantParty) {
  if (viewer.id === owner.id) return "Everyone already sees their own work.";
  if (viewer.role === "FOUNDER" || owner.role === "FOUNDER") return "Founders see all work, and their own work is never shared this way.";
  if (viewer.status === "INACTIVE" || owner.status === "INACTIVE") return "That person has left the company.";
  return null;
}
