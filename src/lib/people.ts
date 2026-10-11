import { db } from "@/lib/db";
import { ROLE_LABEL, isFounder, type Actor } from "@/lib/permissions";
import type { PickablePerson } from "@/components/tasks/assignee-picker";

/**
 * Everyone `actor` can give work to: active people and those on leave. Only
 * founders may put a founder on a task, so others don't see founders here,
 * except any already on the task being edited (`keep`). The server enforces
 * this in `validateAssignees`; this only keeps the picker honest.
 */
export async function pickablePeople(actor: Pick<Actor, "role">, keep: string[] = []): Promise<PickablePerson[]> {
  const people = await db.user.findMany({
    where: {
      status: { not: "INACTIVE" },
      ...(isFounder(actor) ? {} : { OR: [{ role: { not: "FOUNDER" } }, { id: { in: keep } }] }),
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      title: true,
      avatarHue: true,
      role: true,
      status: true,
      department: { select: { name: true } },
    },
  });
  return people.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    title: p.title,
    avatarHue: p.avatarHue,
    roleLabel: ROLE_LABEL[p.role],
    department: p.department?.name ?? null,
    onLeave: p.status === "ON_LEAVE",
  }));
}
