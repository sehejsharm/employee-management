"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { audit } from "@/lib/audit";
import { canManageOrg, canManagePeople, isFounder } from "@/lib/permissions";
import { wouldCreateCycle } from "@/lib/org";
import { fullName, type ActionResult } from "@/lib/utils";
import { DEPARTMENT_COLOR_KEYS } from "@/components/ui/badge";

/** Moves someone on the org chart: who they report to. `null` makes them top-level. */
export async function setManager(userId: string, managerId: string | null): Promise<ActionResult> {
  const actor = await requireUser();
  if (!canManageOrg(actor)) return { ok: false, error: "Only founders, or people they've allowed, can edit the org chart." };

  const edges = await db.user.findMany({ select: { id: true, managerId: true, firstName: true, lastName: true, status: true } });
  const person = edges.find((e) => e.id === userId);
  if (!person) return { ok: false, error: "That person no longer exists." };
  if (managerId) {
    const manager = edges.find((e) => e.id === managerId);
    if (!manager) return { ok: false, error: "That manager no longer exists." };
    if (manager.status === "INACTIVE") return { ok: false, error: `${fullName(manager)} has left — pick someone current.` };
  }
  if (wouldCreateCycle(edges, userId, managerId)) {
    return { ok: false, error: "That would make someone report to their own report. Move the other person first." };
  }
  if (person.managerId === managerId) return { ok: true };

  await db.user.update({ where: { id: userId }, data: { managerId } });
  const managerName = managerId ? fullName(edges.find((e) => e.id === managerId)!) : "the top level";
  await audit({
    actorId: actor.id,
    action: "org.manager_changed",
    targetType: "user",
    targetId: userId,
    summary: `${fullName(person)} now reports to ${managerName}`,
  });
  refresh();
  return { ok: true, message: `${person.firstName} now reports to ${managerName}.` };
}

const placementSchema = z.object({
  title: z.string().trim().max(120).optional().default(""),
  departmentId: z.string().nullable(),
  managerId: z.string().nullable(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"]),
});

/** Title, department, reporting line and whether someone is still working here. */
export async function updatePlacement(userId: string, input: z.input<typeof placementSchema>): Promise<ActionResult> {
  const actor = await requireUser();
  if (!canManageOrg(actor)) return { ok: false, error: "You don't have permission to edit the org chart." };
  const parsed = placementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, firstName: true, lastName: true, status: true } });
  if (!target) return { ok: false, error: "That person no longer exists." };
  if (target.role === "FOUNDER" && !isFounder(actor)) return { ok: false, error: "Only founders can change a founder's placement." };
  if (userId === actor.id && d.status === "INACTIVE") return { ok: false, error: "You can't mark yourself as former." };

  const edges = await db.user.findMany({ select: { id: true, managerId: true } });
  if (wouldCreateCycle(edges, userId, d.managerId)) {
    return { ok: false, error: "That would make someone report to their own report." };
  }

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { title: d.title || null, departmentId: d.departmentId, managerId: d.managerId, status: d.status },
    }),
    ...(d.status === "INACTIVE" ? [db.session.deleteMany({ where: { userId } })] : []),
  ]);

  if (d.status !== target.status) {
    await audit({
      actorId: actor.id,
      action: "org.status_changed",
      targetType: "user",
      targetId: userId,
      summary: `${fullName(target)} marked ${d.status === "INACTIVE" ? "as former" : d.status === "ON_LEAVE" ? "on leave" : "active"}`,
    });
  }
  refresh();
  return { ok: true, message: "Saved." };
}

const departmentSchema = z.object({
  name: z.string().trim().min(2, "Give the department a name.").max(60),
  color: z.string().refine((c) => DEPARTMENT_COLOR_KEYS.includes(c), "Pick a colour."),
  description: z.string().trim().max(200).optional().default(""),
});

export async function saveDepartment(id: string | null, input: z.input<typeof departmentSchema>): Promise<ActionResult> {
  const actor = await requireUser();
  if (!canManageOrg(actor) && !canManagePeople(actor)) return { ok: false, error: "You don't have permission to manage departments." };
  const parsed = departmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const clash = await db.department.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) },
  });
  if (clash) return { ok: false, error: "A department with that name already exists." };
  const data = { name: parsed.data.name, color: parsed.data.color, description: parsed.data.description || null };
  if (id) await db.department.update({ where: { id }, data });
  else await db.department.create({ data });
  await audit({ actorId: actor.id, action: id ? "department.updated" : "department.created", targetType: "department", targetId: id, summary: `${id ? "Updated" : "Created"} department ${data.name}` });
  refresh();
  return { ok: true, message: id ? "Department updated." : "Department created." };
}

export async function deleteDepartment(id: string): Promise<ActionResult> {
  const actor = await requireUser();
  if (!canManageOrg(actor) && !canManagePeople(actor)) return { ok: false, error: "You don't have permission to manage departments." };
  const dept = await db.department.findUnique({ where: { id }, select: { name: true, _count: { select: { members: true } } } });
  if (!dept) return { ok: true };
  await db.department.delete({ where: { id } });
  await audit({ actorId: actor.id, action: "department.deleted", targetType: "department", targetId: id, summary: `Deleted department ${dept.name} (${dept._count.members} members moved to no department)` });
  refresh();
  return { ok: true, message: "Department deleted." };
}

