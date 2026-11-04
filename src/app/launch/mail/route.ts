import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { config as appConfig } from "@/lib/env";
import { forbiddenPage } from "@/lib/hub/forbidden-page";
import { signLaunchTicket } from "@/lib/hub/ticket";

export const dynamic = "force-dynamic";

/**
 * The single Focus Realm website: hands off any signed-in, active teammate —
 * founders and every department — to Mail Merge with a short-lived launch
 * ticket in place of its own login. The app switcher is the only link here —
 * this route re-checks access itself, since hiding a link is never the
 * protection.
 */
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), { headers: { "Cache-Control": "no-store" } });

  const mailOrigin = appConfig.mailMergeOrigin();
  const secret = appConfig.hubSecret();
  if (!mailOrigin || !secret) {
    return new NextResponse(forbiddenPage("Mail Merge isn't set up for this Workspace."), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const user = await getCurrentUser();
  if (!user) return to(`/login?next=${encodeURIComponent("/launch/mail")}`);
  if (user.mustChangePassword) return to("/welcome");

  if (user.status !== "ACTIVE") {
    return new NextResponse(forbiddenPage("Mail Merge is for active team members."), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const ticket = signLaunchTicket(secret, "mail", {
    employeeCode: user.employeeCode,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
    email: user.email,
  });
  return to(`/mail/sso?launch=${encodeURIComponent(ticket)}`);
}
