import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import type { PickablePerson } from "@/components/tasks/assignee-picker";

/** Everyone who can be given work: active people and those on leave. */
export async function pickablePeople(): Promise<PickablePerson[]> {
  const people = await db.user.findMany({
    where: { status: { not: "INACTIVE" } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      title: true,
      avatarHue: true,
      role: true,
      status: true,
      meetingNotes: true,
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
    meetingNotes: p.role === "FOUNDER" ? p.meetingNotes : null,
  }));
}
