import "server-only";
import { db } from "@/lib/db";

/**
 * Checks a reporting line and department before they're saved: the manager must exist
 * and still work here, the department must exist. Returns a message, or null when fine.
 */
export async function placementProblem(managerId: string | null | undefined, departmentId: string | null | undefined) {
  if (managerId) {
    const manager = await db.user.findUnique({ where: { id: managerId }, select: { status: true, firstName: true, lastName: true } });
    if (!manager) return "That manager no longer exists.";
    if (manager.status === "INACTIVE") return `${manager.firstName} ${manager.lastName} has left — pick someone current.`;
  }
  if (departmentId) {
    const dept = await db.department.findUnique({ where: { id: departmentId }, select: { id: true } });
    if (!dept) return "That department no longer exists.";
  }
  return null;
}
