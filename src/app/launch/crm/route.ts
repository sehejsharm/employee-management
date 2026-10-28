import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { config as appConfig } from "@/lib/env";
import { forbiddenPage } from "@/lib/hub/forbidden-page";
import { signLaunchTicket } from "@/lib/hub/ticket";
import { isFounder, isSalesDepartment } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * The single Focus Realm website: hands off a signed-in founder or Sales
 * teammate to the Sales CRM with a short-lived launch ticket in place of its
 * own login. The app switcher is the only link here — this route re-checks
 * access itself, since hiding a link is never the protection.
 */
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), { headers: { "Cache-Control": "no-store" } });

  const crmOrigin = appConfig.crmOrigin();
  const secret = appConfig.hubSecret();
  if (!crmOrigin || !secret) {
    return new NextResponse(forbiddenPage("The Sales CRM isn't set up for this Workspace."), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const user = await getCurrentUser();
  if (!user) return to(`/login?next=${encodeURIComponent("/launch/crm")}`);
  if (user.mustChangePassword) return to("/welcome");

  if (!isFounder(user) && !isSalesDepartment(user)) {
    return new NextResponse(forbiddenPage("The Sales CRM is for the sales department."), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const ticket = signLaunchTicket(secret, "crm", {
    employeeCode: user.employeeCode,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
  });
  return to(`/crm/sso?launch=${encodeURIComponent(ticket)}`);
}
