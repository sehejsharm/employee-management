import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { AddMemberDialog } from "@/components/people/add-member-dialog";
import { Button } from "@/components/ui/button";
import { Directory } from "@/components/people/directory";
import { requireUser } from "@/lib/auth/current-user";
import { getClearedIds, redactFocus } from "@/lib/clearance";
import { db } from "@/lib/db";
import { ROLE_LABEL, canManagePeople, isFounder } from "@/lib/permissions";
import { emailUsageCounts } from "@/lib/shared-email";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  const user = await requireUser();
  const [everyone, departments, cleared, emailCounts] = await Promise.all([
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
        email: true,
        location: true,
        focus: true,
        department: { select: { id: true, name: true, color: true } },
        manager: { select: { firstName: true, lastName: true } },
        additionalManagers: { select: { manager: { select: { firstName: true, lastName: true, status: true } } } },
      },
    }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    getClearedIds(user),
    emailUsageCounts(),
  ]);
  // What someone is focused on is their work: shown only with clearance, and founders' only to founders.
  const people = redactFocus(user, everyone, cleared);
  const current = people.filter((p) => p.status !== "INACTIVE");

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="People"
        description={`${current.length} people at Focus Realm. Everyone's contact details and who they work with.`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/people/emails">
                <Mail /> Who uses which email
              </Link>
            </Button>
            {canManagePeople(user) && (
              <AddMemberDialog
                departments={departments}
                managers={current.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, title: p.title }))}
                canAddFounder={isFounder(user)}
              />
            )}
          </>
        }
      />
      <Directory
        departments={departments}
        people={people.map((p) => ({
          ...p,
          roleLabel: ROLE_LABEL[p.role],
          sharedEmailWith: p.status === "INACTIVE" ? 0 : Math.max(0, (emailCounts.get(p.email) ?? 1) - 1),
          manager:
            [p.manager, ...p.additionalManagers.map((a) => a.manager).filter((m) => m.status !== "INACTIVE")]
              .filter((m): m is { firstName: string; lastName: string } => !!m)
              .map((m) => `${m.firstName} ${m.lastName}`)
              .join(" & ") || null,
        }))}
      />
    </>
  );
}
