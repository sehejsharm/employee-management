import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isFounder, type Actor } from "@/lib/permissions";

/**
 * Clearance: who may look at whose work.
 *
 * - Everyone always sees their own work and the tasks they're part of
 *   (as lead, follower or the person who assigned it).
 * - Founders see everything.
 * - Anyone else needs clearance, which only a founder can grant — one viewer,
 *   one colleague at a time, optionally until a date.
 * - Founders' work is never visible to anyone but founders. Clearance can't be
 *   granted over a founder, and tasks a founder works on stay founders-only.
 */

/** Live clearances: not revoked and not expired. */
export function activeClearanceWhere(now = new Date()): Prisma.ClearanceWhereInput {
  return { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

/**
 * The people whose work the viewer is cleared to see (never founders).
 * Founders don't need clearance; for them this is empty and ignored.
 */
export const getClearedIds = cache(async (viewer: Pick<Actor, "id" | "role">): Promise<Set<string>> => {
  if (isFounder(viewer)) return new Set();
  const rows = await db.clearance.findMany({
    where: { viewerId: viewer.id, ...activeClearanceWhere(), subject: { role: { not: "FOUNDER" } } },
    select: { subjectId: true },
  });
  return new Set(rows.map((r) => r.subjectId));
});

/** May the viewer see this person's work (their task list, focus, workload)? */
export function canSeeWorkOf(viewer: Pick<Actor, "id" | "role">, subject: { id: string; role: string }, cleared: Set<string>) {
  if (viewer.id === subject.id) return true;
  if (isFounder(viewer)) return true;
  if (subject.role === "FOUNDER") return false;
  return cleared.has(subject.id);
}

/** Why the viewer can't see someone's work — the copy for the "No clearance given" screen. */
export function clearanceBlock(subject: { role: string; firstName: string }) {
  return subject.role === "FOUNDER"
    ? { requestable: false, reason: "Founders' work is visible only to other founders." }
    : { requestable: true, reason: `Seeing ${subject.firstName}'s work needs clearance from a founder.` };
}

/** Hides `focus` (what someone says they're working on) from anyone not cleared to see their work. */
export function redactFocus<T extends { id: string; role: string; focus?: string | null; focusUpdatedAt?: Date | null }>(
  viewer: Pick<Actor, "id" | "role">,
  people: T[],
  cleared: Set<string>,
): T[] {
  return people.map((p) => (canSeeWorkOf(viewer, p, cleared) ? p : { ...p, focus: null, focusUpdatedAt: null }));
}

/** For an open request from viewer about subject: who it's still waiting on ("Asha and a founder"), or null. */
export async function pendingClearanceWaitingOn(viewerId: string, subject: { id: string; firstName: string }) {
  const r = await db.clearanceRequest.findFirst({
    where: { requesterId: viewerId, subjectId: subject.id, status: "PENDING" },
    select: { subjectConsent: true, founderApproved: true },
  });
  if (!r) return null;
  const waits: string[] = [];
  if (r.subjectConsent === null) waits.push(subject.firstName);
  if (r.founderApproved === null) waits.push("a founder");
  return waits.join(" and ") || "a founder";
}
