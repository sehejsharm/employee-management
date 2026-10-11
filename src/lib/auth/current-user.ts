import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SESSION_COOKIE, hashToken } from "./tokens";
import { NO_GRANTS, isFounder, type Actor, type GrantedOwnerIds } from "@/lib/permissions";
import { grantedOwnersByViewer } from "@/lib/visibility";

/**
 * The Data Access Layer's entry point. Reads the session cookie, looks the
 * session up, and returns a narrow view of the signed-in person. Memoised per
 * request, so every component and action can call it freely.
 */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          employeeCode: true,
          email: true,
          firstName: true,
          lastName: true,
          title: true,
          role: true,
          status: true,
          canAssignTasks: true,
          canManageOrg: true,
          canManagePeople: true,
          avatarHue: true,
          focus: true,
          mustChangePassword: true,
          managerId: true,
          department: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) return null;
  // Former employees lose access the moment they are marked inactive.
  if (session.user.status === "INACTIVE") return null;

  return session.user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** For pages and actions that need a signed-in, fully set-up user. */
export async function requireUser(): Promise<CurrentUser & Actor> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/welcome");
  return user;
}

const grantsOf = cache(async (viewerId: string): Promise<GrantedOwnerIds> => {
  const map = await grantedOwnersByViewer([viewerId]);
  return map.get(viewerId) ?? NO_GRANTS;
});

/**
 * Whose work the signed-in person has been allowed to see by a founder, the
 * only route to anyone else's work for a non-founder. Read fresh on every
 * request (memoised only within it), so revoking a grant takes effect at once.
 * Founders see everything and have no grants.
 */
export function getGrantedOwnerIds(user: Pick<Actor, "id" | "role">): Promise<GrantedOwnerIds> {
  return isFounder(user) ? Promise.resolve(NO_GRANTS) : grantsOf(user.id);
}
