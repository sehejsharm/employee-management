import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { OrgChart } from "@/components/org/org-chart";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { ROLE_LABEL, canManageOrg, isFounder } from "@/lib/permissions";

export const metadata: Metadata = { title: "Org chart" };

export default async function OrgPage() {
  const user = await requireUser();
  const [people, departments] = await Promise.all([
    db.user.findMany({
      orderBy: [{ orgOrder: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
        role: true,
        status: true,
        managerId: true,
        avatarHue: true,
        focus: true,
        orgOrder: true,
        employeeCode: true,
        department: { select: { id: true, name: true, color: true } },
      },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
  ]);

  const active = people.filter((p) => p.status !== "INACTIVE");
  const editable = canManageOrg(user);

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="Organisation"
        description={`${active.length} people across ${departments.length} departments. ${editable ? "You can edit the hierarchy — switch on edit mode to move people." : "Click anyone to see who they work with."}`}
      />
      <OrgChart
        people={people.map((p) => ({ ...p, roleLabel: ROLE_LABEL[p.role] }))}
        departments={departments}
        canEdit={editable}
        meId={user.id}
        viewerIsFounder={isFounder(user)}
      />
    </>
  );
}
