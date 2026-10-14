"use server";

import { placementProblem } from "@/lib/placement";
import { closeOutAfterLeaving } from "@/lib/offboarding";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { AccountError, createAccount, setPassword } from "@/lib/accounts";
import { audit } from "@/lib/audit";
import { canChangeEmail, canManagePeople, defaultGrants, isFounder, ROLE_LABEL } from "@/lib/permissions";
import { isAboveInReportingLine, wouldCreateCycle } from "@/lib/org";
import { reportingEdges } from "@/lib/reporting";
import { notify } from "@/lib/notifications";
import { fullName, type ActionResult } from "@/lib/utils";
import { fileReportOnOffboarding } from "@/lib/work-report";

const ROLES = ["FOUNDER", "MANAGER", "EMPLOYEE", "INTERN"] as const;

const memberSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  lastName: z.string().trim().max(60).optional().default(""),
  email: z.email("Enter a valid work email.").max(254),
  role: z.enum(ROLES),
  title: z.string().trim().max(120).optional().default(""),
  departmentId: z.string().nullable(),
  managerId: z.string().nullable(),
  employeeCode: z.string().trim().max(32).optional().default(""),
});

/**
 * Adds someone by hand — for founders, before the HR console is connected,
 * or for anyone who isn't onboarded through it. Returns the temporary
 * password exactly once.
 */
export async function addMember(
  input: z.input<typeof memberSchema>,
): Promise<ActionResult<{ id: string; employeeCode: string; email: string; temporaryPassword: string }>> {
  const actor = await requireUser();
  if (!canManagePeople(actor)) return { ok: false, error: "Only founders, or people they've allowed, can add members." };
  const parsed = memberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.role === "FOUNDER" && !isFounder(actor)) return { ok: false, error: "Only founders can add another founder." };

  try {
    const { user, generatedPassword } = await createAccount({
      email: d.email,
      firstName: d.firstName,
      lastName: d.lastName,
      employeeCode: d.employeeCode || undefined,
      role: d.role,
      title: d.title,
      departmentId: d.departmentId,
      managerId: d.managerId,
      source: "MANUAL",
    });
    await audit({
      actorId: actor.id,
      action: "account.created",
      targetType: "user",
      targetId: user.id,
      summary: `Added ${fullName(user)} (${user.employeeCode}) as ${ROLE_LABEL[d.role]}`,
    });
    if (d.managerId) {
      await notify([d.managerId], {
        kind: "SYSTEM",
        actorId: actor.id,
        title: `${fullName(user)} now reports to you`,
        body: d.title || ROLE_LABEL[d.role],
        href: `/people/${user.id}`,
      });
    }
    refresh();
    return {
      ok: true,
      data: { id: user.id, employeeCode: user.employeeCode, email: user.email, temporaryPassword: generatedPassword! },
    };
  } catch (error) {
    if (error instanceof AccountError) return { ok: false, error: error.message };
    throw error;
  }
}

const accessSchema = z.object({
  role: z.enum(ROLES),
  title: z.string().trim().max(120).optional().default(""),
  departmentId: z.string().nullable(),
  managerId: z.string().nullable(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"]),
  canAssignTasks: z.boolean(),
  canManageOrg: z.boolean(),
  canManagePeople: z.boolean(),
});

export async function updateMember(userId: string, input: z.input<typeof accessSchema>): Promise<ActionResult> {
  const actor = await requireUser();
  if (!canManagePeople(actor)) return { ok: false, error: "You don't have permission to change accounts." };
  const parsed = accessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, role: true, status: true, lastDay: true, canAssignTasks: true, canManageOrg: true, canManagePeople: true },
  });
  if (!target) return { ok: false, error: "That person no longer exists." };

  const touchesFounder = target.role === "FOUNDER" || d.role === "FOUNDER";
  if (touchesFounder && !isFounder(actor)) return { ok: false, error: "Only founders can change founder accounts." };
  if (userId === actor.id && (d.status === "INACTIVE" || d.role !== target.role)) {
    return { ok: false, error: "You can't change your own role or deactivate yourself. Ask another founder." };
  }
  if (target.role === "FOUNDER" && (d.role !== "FOUNDER" || d.status === "INACTIVE")) {
    const others = await db.user.count({ where: { role: "FOUNDER", status: { not: "INACTIVE" }, NOT: { id: userId } } });
    if (others === 0) return { ok: false, error: "The workspace needs at least one active founder." };
  }

  const problem = await placementProblem(d.managerId, d.departmentId);
  if (problem) return { ok: false, error: problem };
  if (wouldCreateCycle(await reportingEdges(), userId, d.managerId)) return { ok: false, error: "That would make someone report to their own report." };

  // Founders always hold every grant.
  const grants = d.role === "FOUNDER" ? defaultGrants("FOUNDER") : { canAssignTasks: d.canAssignTasks, canManageOrg: d.canManageOrg, canManagePeople: d.canManagePeople };

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        role: d.role,
        title: d.title || null,
        departmentId: d.departmentId,
        managerId: d.managerId,
        status: d.status,
        ...grants,
        // Leaving ends their work period, so their record stops counting later deadlines against them.
        ...(d.status === "INACTIVE" && target.status !== "INACTIVE" && !target.lastDay ? { lastDay: new Date() } : {}),
      },
    }),
    ...(d.managerId ? [db.additionalManager.deleteMany({ where: { userId, managerId: d.managerId } })] : []),
    ...(d.status === "INACTIVE" ? [db.session.deleteMany({ where: { userId } })] : []),
  ]);

  if (d.status === "INACTIVE" && target.status !== "INACTIVE") {
    await fileReportOnOffboarding(userId, actor.id).catch((e) => console.error("offboarding report failed", e));
    await closeOutAfterLeaving(userId);
  }
  const changes: string[] = [];
  if (d.role !== target.role) changes.push(`role ${ROLE_LABEL[target.role]} → ${ROLE_LABEL[d.role]}`);
  if (d.status !== target.status) changes.push(`status ${target.status.toLowerCase()} → ${d.status.toLowerCase()}`);
  for (const key of ["canAssignTasks", "canManageOrg", "canManagePeople"] as const) {
    if (grants[key] !== target[key]) changes.push(`${key} ${grants[key] ? "granted" : "revoked"}`);
  }
  await audit({
    actorId: actor.id,
    action: "account.updated",
    targetType: "user",
    targetId: userId,
    summary: `Updated ${fullName(target)}${changes.length ? `: ${changes.join(", ")}` : ""}`,
  });
  refresh();
  return { ok: true, message: "Account updated." };
}

export async function resetMemberPassword(userId: string): Promise<ActionResult<{ temporaryPassword: string; employeeCode: string }>> {
  const actor = await requireUser();
  if (!canManagePeople(actor)) return { ok: false, error: "You don't have permission to reset passwords." };
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, firstName: true, lastName: true, employeeCode: true } });
  if (!target) return { ok: false, error: "That person no longer exists." };
  if (target.role === "FOUNDER" && !isFounder(actor)) return { ok: false, error: "Only founders can reset a founder's password." };
  if (target.id === actor.id) return { ok: false, error: "Change your own password from Settings." };

  const { generatedPassword } = await setPassword(userId);
  await audit({
    actorId: actor.id,
    action: "account.password_reset",
    targetType: "user",
    targetId: userId,
    summary: `Reset ${fullName(target)}'s password`,
  });
  return { ok: true, data: { temporaryPassword: generatedPassword!, employeeCode: target.employeeCode } };
}

export async function revokeMemberSessions(userId: string): Promise<ActionResult> {
  const actor = await requireUser();
  if (!canManagePeople(actor)) return { ok: false, error: "You don't have permission to do that." };
  const target = await db.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  if (!target) return { ok: false, error: "That person no longer exists." };
  const { count } = await db.session.deleteMany({ where: { userId } });
  await audit({ actorId: actor.id, action: "account.sessions_revoked", targetType: "user", targetId: userId, summary: `Signed ${fullName(target)} out everywhere` });
  return { ok: true, message: count ? `Signed out of ${count} device${count === 1 ? "" : "s"}.` : "They weren't signed in anywhere." };
}

const emailSchema = z.object({ email: z.email("Enter a valid email address.").max(254) });

/** Loads the target and checks the actor may change their email. */
async function emailTarget(userId: string) {
  const actor = await requireUser();
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, firstName: true, lastName: true, email: true, status: true, source: true, emailSetManuallyAt: true },
  });
  if (!target) return { error: "That person no longer exists." } as const;
  if (!canChangeEmail(actor, target, isAboveInReportingLine(await reportingEdges(), actor.id, target.id))) {
    return { error: "Only a founder or someone they report to can change their email." } as const;
  }
  return { actor, target } as const;
}

/**
 * Changes someone's email. Founders, people admins and anyone above them in
 * the reporting line can do it. Emails can be shared, so there's no clash
 * check; sign-in is unaffected (it uses the employee ID). An email changed
 * here is kept even when the HR console later sends a different one.
 */
export async function changeMemberEmail(userId: string, input: z.input<typeof emailSchema>): Promise<ActionResult> {
  const r = await emailTarget(userId);
  if ("error" in r) return { ok: false, error: r.error! };
  const { actor, target } = r;
  const parsed = emailSchema.safeParse({ email: String(input.email ?? "").trim() });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const email = parsed.data.email.toLowerCase();
  if (email === target.email) return { ok: true, message: "That's already their email." };

  await db.user.update({ where: { id: userId }, data: { email, emailSetManuallyAt: new Date() } });
  await audit({
    actorId: actor.id,
    action: "account.email_changed",
    targetType: "user",
    targetId: userId,
    summary: `Changed ${fullName(target)}'s email from ${target.email} to ${email}`,
  });
  await notify([userId], {
    kind: "SYSTEM",
    actorId: actor.id,
    title: `${actor.firstName} changed your email to ${email}`,
    body: "You still sign in with your employee ID.",
    href: `/people/${userId}`,
  });
  refresh();
  return { ok: true, message: `Email changed to ${email}.` };
}

/** Lets HR console updates manage this person's email again. */
export async function releaseMemberEmail(userId: string): Promise<ActionResult> {
  const r = await emailTarget(userId);
  if ("error" in r) return { ok: false, error: r.error! };
  await db.user.update({ where: { id: userId }, data: { emailSetManuallyAt: null } });
  await audit({
    actorId: r.actor.id,
    action: "account.email_released",
    targetType: "user",
    targetId: userId,
    summary: `Let the HR console manage ${fullName(r.target)}'s email again`,
  });
  refresh();
  return { ok: true, message: "The HR console will update this email again on its next sync." };
}
