import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { config as appConfig } from "@/lib/env";
import { forbiddenPage } from "@/lib/hub/forbidden-page";
import { signLaunchTicket } from "@/lib/hub/ticket";
import { isFounder } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * The single Focus Realm website: hands off a signed-in founder to the HR
 * console with a short-lived launch ticket in place of its own login. The
 * app switcher is the only link here — this route re-checks access itself,
 * since hiding a link is never the protection.
 */
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), { headers: { "Cache-Control": "no-store" } });

  const hrOrigin = appConfig.hrConsoleOrigin();
  const secret = appConfig.hubSecret();
  if (!hrOrigin || !secret) {
    return new NextResponse(forbiddenPage("The HR console isn't set up for this Workspace."), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const user = await getCurrentUser();
  if (!user) return to(`/login?next=${encodeURIComponent("/launch/hr")}`);
  if (user.mustChangePassword) return to("/welcome");

  if (!isFounder(user)) {
    return new NextResponse(forbiddenPage("The HR console is for founders only."), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const ticket = signLaunchTicket(secret, "hr", {
    employeeCode: user.employeeCode,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
  });
  return to(`/hr/admin?launch=${encodeURIComponent(ticket)}`);
}
