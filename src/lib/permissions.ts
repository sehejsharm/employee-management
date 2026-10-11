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

export interface TaskAccessContext {
  createdById: string;
  assigneeIds: string[];
  /** A founder is among the assignees: founders' work is visible to founders alone. */
  involvesFounder: boolean;
}

/** Lead, follower or the person who assigned it. */
export function isInvolved(a: Pick<Actor, "id">, task: Pick<TaskAccessContext, "createdById" | "assigneeIds">) {
  return task.createdById === a.id || task.assigneeIds.includes(a.id);
}

/**
 * Who can see a task: founders see everything; everyone else sees what they
 * created or are assigned, plus the work of colleagues a founder has cleared
 * them to see — never work a founder is doing.
 */
export function canViewTask(a: Actor, task: TaskAccessContext, clearedIds?: Set<string>) {
  if (isFounder(a)) return true;
  if (isInvolved(a, task)) return true;
  if (task.involvesFounder) return false;
  return !!clearedIds && task.assigneeIds.some((id) => clearedIds.has(id));
}

/** Title, description, deadline, lead and followers. */
export function canEditTask(a: Actor, task: Pick<TaskAccessContext, "createdById">) {
  return isFounder(a) || task.createdById === a.id;
}

/** Reviewing submitted work — accepting it or sending it back. Whoever assigned it, or a founder. */
export const canReviewWork = canEditTask;

/** Handing in work for review: the lead and followers. */
export function canSubmitWork(a: Actor, task: Pick<TaskAccessContext, "assigneeIds">) {
  return task.assigneeIds.includes(a.id);
}

/** Moving a task through its statuses (submission and review have their own gates). */
export function canChangeStatus(a: Actor, task: TaskAccessContext) {
  return canEditTask(a, task) || task.assigneeIds.includes(a.id);
}

/** Asking assignees for a progress update: founders and whoever assigned it. Clearance is look-only, so it doesn't count. */
export function canRequestUpdate(a: Actor, task: TaskAccessContext) {
  if (task.assigneeIds.length === 0) return false;
  if (task.assigneeIds.length === 1 && task.assigneeIds[0] === a.id) return false;
  return isFounder(a) || task.createdById === a.id;
}

/** Commenting, attaching and checking things off: the people doing the work, whoever assigned it, and founders. Clearance is look-only. */
export function canContribute(a: Actor, task: TaskAccessContext) {
  return isFounder(a) || isInvolved(a, task);
}
