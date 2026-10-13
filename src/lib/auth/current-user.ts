import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { reportingEdges } from "@/lib/reporting";
import { SESSION_COOKIE, hashToken } from "./tokens";
import type { Actor } from "@/lib/permissions";

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
          calendarEmail: true,
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

/** Ids of everyone below a person through any reporting line (main or additional). */
export const getSubordinateIds = cache(async (userId: string) => {
  const edges = await reportingEdges();
  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (!e.managerId) continue;
    const list = children.get(e.managerId) ?? [];
    list.push(e.id);
    children.set(e.managerId, list);
  }
  const result = new Set<string>();
  const stack = [...(children.get(userId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return result;
});
