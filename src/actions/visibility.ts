"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current-user";
import { audit } from "@/lib/audit";
import { canManageVisibilityGrants, visibilityGrantProblem } from "@/lib/permissions";
import { fullName, type ActionResult } from "@/lib/utils";

/**
 * Founders decide, person by person, whose work someone else may see. A grant
 * is view only and never covers founders' work; see `canViewTask`.
 */

const pairSchema = z.object({
  viewerId: z.string().trim().min(1).max(64),
  ownerId: z.string().trim().min(1).max(64),
});

const partySelect = { id: true, firstName: true, lastName: true, role: true, status: true } as const;

export async function grantWorkVisibility(viewerId: string, ownerId: string): Promise<ActionResult> {
  const actor = await requireUser();
  if (!canManageVisibilityGrants(actor)) return { ok: false, error: "Only founders can decide who sees whose work." };
  const parsed = pairSchema.safeParse({ viewerId, ownerId });
  if (!parsed.success) return { ok: false, error: "Pick someone first." };

  const [viewer, owner] = await Promise.all([
    db.user.findUnique({ where: { id: parsed.data.viewerId }, select: partySelect }),
    db.user.findUnique({ where: { id: parsed.data.ownerId }, select: partySelect }),
  ]);
  if (!viewer || !owner) return { ok: false, error: "That person no longer exists." };
  const problem = visibilityGrantProblem(viewer, owner);
  if (problem) return { ok: false, error: problem };

  const existing = await db.workVisibilityGrant.findUnique({
    where: { viewerId_ownerId: { viewerId: viewer.id, ownerId: owner.id } },
    select: { id: true },
  });
  if (existing) return { ok: true, message: `${viewer.firstName} can already see ${owner.firstName}'s work.` };

  await db.workVisibilityGrant.createMany({
    data: [{ viewerId: viewer.id, ownerId: owner.id, grantedById: actor.id }],
    skipDuplicates: true,
  });
  await audit({
    actorId: actor.id,
    action: "visibility.granted",
    targetType: "user",
    targetId: viewer.id,
    summary: `Let ${fullName(viewer)} see ${fullName(owner)}'s work (view only)`,
    meta: { viewerId: viewer.id, ownerId: owner.id },
  });
  refresh();
  return { ok: true, message: `${viewer.firstName} can now see ${owner.firstName}'s work.` };
}

export async function revokeWorkVisibility(viewerId: string, ownerId: string): Promise<ActionResult> {
  const actor = await requireUser();
  if (!canManageVisibilityGrants(actor)) return { ok: false, error: "Only founders can decide who sees whose work." };
  const parsed = pairSchema.safeParse({ viewerId, ownerId });
  if (!parsed.success) return { ok: false, error: "Pick someone first." };

  const { count } = await db.workVisibilityGrant.deleteMany({ where: { viewerId: parsed.data.viewerId, ownerId: parsed.data.ownerId } });
  if (count === 0) return { ok: true, message: "That was already removed." };

  const people = await db.user.findMany({
    where: { id: { in: [parsed.data.viewerId, parsed.data.ownerId] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const name = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p ? fullName(p) : "a former member";
  };
  await audit({
    actorId: actor.id,
    action: "visibility.revoked",
    targetType: "user",
    targetId: parsed.data.viewerId,
    summary: `Stopped ${name(parsed.data.viewerId)} seeing ${name(parsed.data.ownerId)}'s work`,
    meta: { viewerId: parsed.data.viewerId, ownerId: parsed.data.ownerId },
  });
  refresh();
  return { ok: true, message: "Removed. It takes effect immediately." };
}
