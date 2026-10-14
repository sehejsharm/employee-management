import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import type { PickablePerson } from "@/components/tasks/assignee-picker";

/** Everyone who can be given work: active people and those on leave. */
export async function pickablePeople(): Promise<PickablePerson[]> {
  // Whose calendar invites land in an inbox someone else (current or former) also reads.
  const inboxes = await db.user.findMany({ select: { email: true, calendarEmail: true } });
  const readers = new Map<string, number>();
  for (const u of inboxes) {
    const inbox = (u.calendarEmail || u.email).toLowerCase();
    readers.set(inbox, (readers.get(inbox) ?? 0) + 1);
  }
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
      email: true,
      calendarEmail: true,
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
    sharedInbox: (readers.get((p.calendarEmail || p.email).toLowerCase()) ?? 0) > 1,
  }));
}
