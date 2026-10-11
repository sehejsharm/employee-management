import { AppShell } from "@/components/app/app-shell";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { ROLE_LABEL, canAdminister, canAssignTasks, canManagePeople, isFounder, isLeader } from "@/lib/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });

  return (
    <AppShell
      user={{
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        employeeCode: user.employeeCode,
        title: user.title,
        roleLabel: ROLE_LABEL[user.role],
        avatarHue: user.avatarHue,
      }}
      flags={{
        isLeader: isLeader(user),
        isFounder: isFounder(user),
        canAssign: canAssignTasks(user),
        canAdminister: canAdminister(user),
        canManagePeople: canManagePeople(user),
      }}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
