import { AppShell } from "@/components/app/app-shell";
import { getUnreadForSession, requireUser } from "@/lib/auth/current-user";
import { config as appConfig } from "@/lib/env";
import { ROLE_LABEL, canAdminister, canAssignTasks, canManagePeople, isFounder, isLeader, isSalesDepartment } from "@/lib/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Both in one round trip: the unread count doesn't wait for the session lookup.
  const [user, unread] = await Promise.all([requireUser(), getUnreadForSession()]);
  const founder = isFounder(user);

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
        isFounder: founder,
        canAssign: canAssignTasks(user),
        canAdminister: canAdminister(user),
        canManagePeople: canManagePeople(user),
        canUseHr: founder && !!appConfig.hrConsoleOrigin(),
        canUseCrm: (founder || isSalesDepartment(user)) && !!appConfig.crmOrigin(),
        canUseMail: user.status === "ACTIVE" && !!appConfig.mailMergeOrigin(),
      }}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
