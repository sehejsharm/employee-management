import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { config } from "@/lib/env";
import { OAUTH_COOKIE, googleConfig } from "@/lib/google/config";
import { consentUrl } from "@/lib/google/calendar";
import { isFounder } from "@/lib/permissions";

export const dynamic = "force-dynamic";


/**
 * Starts connecting a Google account. kind=personal: a founder's own calendar
 * (people request time with them). kind=team: the shared company calendar.
 * Founders only — a calendar login is as sensitive as it gets.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const back = (q: string) => NextResponse.redirect(new URL(`/calendar?${q}`, config.appUrl()));
  if (!user) return NextResponse.redirect(new URL("/login?next=/calendar", config.appUrl()));
  if (!googleConfig.configured()) return back("google=not-configured");
  if (!isFounder(user)) return back("google=founders-only");

  const kind = request.nextUrl.searchParams.get("kind") === "team" ? "team" : "personal";
  const nonce = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(consentUrl(nonce, kind === "personal" ? (user.calendarEmail ?? undefined) : undefined));
  response.cookies.set(OAUTH_COOKIE, `${nonce}.${kind}.${user.id}`, {
    httpOnly: true,
    secure: config.isProduction(),
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return response;
}
