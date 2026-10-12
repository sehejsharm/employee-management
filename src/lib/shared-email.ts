import "server-only";
import { db } from "@/lib/db";

/**
 * Several employees can share one mailbox. Everyone can see who uses which
 * email, so nobody is surprised by a message meant for a colleague. People are
 * still told apart — and sign in — by their employee ID.
 */

const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
  title: true,
  avatarHue: true,
  employeeCode: true,
  status: true,
} as const;

/** Current colleagues using the same email as this person (never themselves, never former employees). */
export async function sharingEmailWith(person: { id: string; email: string }) {
  return db.user.findMany({
    where: { email: person.email, id: { not: person.id }, status: { not: "INACTIVE" } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: personSelect,
  });
}

/** How many current people use each email — for "shared by N" badges. */
export async function emailUsageCounts() {
  const rows = await db.user.groupBy({ by: ["email"], where: { status: { not: "INACTIVE" } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.email, r._count._all]));
}

/** Every email in the company with the current people using it, shared ones first. */
export async function emailDirectory() {
  const people = await db.user.findMany({
    where: { status: { not: "INACTIVE" } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { ...personSelect, email: true, department: { select: { name: true } } },
  });
  const groups = new Map<string, typeof people>();
  for (const p of people) groups.set(p.email, [...(groups.get(p.email) ?? []), p]);
  return [...groups.entries()]
    .map(([email, users]) => ({ email, users }))
    .sort((a, b) => b.users.length - a.users.length || a.email.localeCompare(b.email));
}
