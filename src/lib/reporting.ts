import "server-only";
import { db } from "@/lib/db";
import { withAdditionalLines } from "@/lib/org";

/** Every reporting line in the company — main managers and additional ones — for cycle and "is their boss" checks. */
export async function reportingEdges() {
  const [people, additional] = await Promise.all([
    db.user.findMany({ select: { id: true, managerId: true } }),
    db.additionalManager.findMany({ select: { userId: true, managerId: true } }),
  ]);
  return withAdditionalLines(people, additional);
}
