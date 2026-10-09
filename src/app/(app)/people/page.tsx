import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { AddMemberDialog } from "@/components/people/add-member-dialog";
import { Directory } from "@/components/people/directory";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { ROLE_LABEL, canManagePeople, isFounder } from "@/lib/permissions";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  const user = await requireUser();
  const [people, departments] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
        role: true,
        status: true,
        avatarHue: true,
        employeeCode: true,
        location: true,
        focus: true,
        department: { select: { id: true, name: true, color: true } },
        manager: { select: { firstName: true, lastName: true } },
      },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
  ]);
  const current = people.filter((p) => p.status !== "INACTIVE");

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="People"
        description={`${current.length} people at Focus Realm. Everyone's contact details and who they work with.`}
        actions={
          canManagePeople(user) ? (
            <AddMemberDialog
              departments={departments}
              managers={current.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, title: p.title }))}
              canAddFounder={isFounder(user)}
            />
          ) : undefined
        }
      />
      <Directory
        departments={departments}
        people={people.map((p) => ({
          ...p,
          roleLabel: ROLE_LABEL[p.role],
          manager: p.manager ? `${p.manager.firstName} ${p.manager.lastName}` : null,
        }))}
      />
    </>
  );
}
