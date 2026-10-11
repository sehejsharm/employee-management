import { AppShell } from "@/components/app/app-shell";
import { getGrantedOwnerIds, requireUser } from "@/lib/auth/current-user";
import { unreadCount } from "@/lib/notification-feed";
import { ROLE_LABEL, canAdminister, canAssignTasks, canManagePeople, isFounder } from "@/lib/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await unreadCount(user, await getGrantedOwnerIds(user));

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
