import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * Work visibility grants that are in force. Roles and status are read when
 * the grant is used, not when it was made: if either person becomes a founder,
 * or the owner leaves, the grant stops counting.
 */
export const grantInForce = {
  viewer: { role: { not: "FOUNDER" } },
  owner: { role: { not: "FOUNDER" }, status: { not: "INACTIVE" } },
} satisfies Prisma.WorkVisibilityGrantWhereInput;

/** Whose work each of these people may see. People with no grants in force are left out of the map. */
export async function grantedOwnersByViewer(viewerIds: string[]) {
  const map = new Map<string, Set<string>>();
  if (viewerIds.length === 0) return map;
  const rows = await db.workVisibilityGrant.findMany({
    where: { viewerId: { in: [...new Set(viewerIds)] }, ...grantInForce },
    select: { viewerId: true, ownerId: true },
  });
  for (const r of rows) {
    const set = map.get(r.viewerId) ?? new Set<string>();
    set.add(r.ownerId);
    map.set(r.viewerId, set);
  }
  return map;
}
