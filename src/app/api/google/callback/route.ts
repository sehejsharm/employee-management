import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { GoogleError, ensureTeamCalendar, exchangeCode, openUpcomingMeetLinks } from "@/lib/google/calendar";
import { sealToken } from "@/lib/google/crypto";
import { isFounder } from "@/lib/permissions";
import { inBackground } from "@/lib/push";
import { getTimeZone } from "@/lib/tz.server";
import { OAUTH_COOKIE } from "@/lib/google/config";

export const dynamic = "force-dynamic";

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Google sends the person back here after the consent screen. */
export async function GET(request: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/calendar?${q}`, config.appUrl()));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/google" });
    return res;
  };
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back("google=cancelled");

  const user = await getCurrentUser();
  if (!user || !isFounder(user)) return back("google=founders-only");

  // The state must match the cookie set when this person started, for this person.
  const [nonce, kind, userId] = (request.cookies.get(OAUTH_COOKIE)?.value ?? "").split(".");
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  if (!nonce || !state || !code || !same(nonce, state) || userId !== user.id || (kind !== "team" && kind !== "personal")) {
    return back("google=expired");
  }

  try {
    const account = await exchangeCode(code);
    const tokens = {
      googleEmail: account.email,
      refreshToken: sealToken(account.refreshToken),
      accessToken: sealToken(account.accessToken),
      accessTokenExpiresAt: account.expiresAt,
      lastError: null,
      scopes: account.scopes,
      meetError: null,
      connectedById: user.id,
    };

    if (kind === "personal") {
      const [conn] = await db.$transaction([
        db.googleConnection.upsert({
          where: { userId: user.id },
          create: { kind: "PERSONAL", userId: user.id, calendarId: "primary", calendarName: account.email, ...tokens },
          update: { calendarId: "primary", calendarName: account.email, ...tokens },
        }),
        // Invites to this founder now go to the calendar they actually use.
        db.user.update({ where: { id: user.id }, data: { calendarEmail: account.email } }),
      ]);
      // Meetings booked before the Meet permission was given become open to anyone with the link too.
      inBackground(() => openUpcomingMeetLinks(conn));
      await audit({ actorId: user.id, action: "google.personal_connected", targetType: "user", targetId: user.id, summary: `Connected Google Calendar ${account.email}` });
      return back("google=personal-connected");
    }

    const conn = await db.googleConnection.upsert({
      where: { teamKey: "team" },
      create: { kind: "TEAM", teamKey: "team", ...tokens },
      update: tokens,
    });
    const calendar = await ensureTeamCalendar(conn, await getTimeZone());
    const saved = await db.googleConnection.update({ where: { id: conn.id }, data: { calendarId: calendar.id, calendarName: calendar.name } });
    inBackground(() => openUpcomingMeetLinks(saved));
    await audit({ actorId: user.id, action: "google.team_connected", targetType: "workspace", summary: `Connected the team calendar "${calendar.name}" through ${account.email}` });
    return back("google=team-connected");
  } catch (error) {
    console.error("Google connect failed", error);
    const reason = error instanceof GoogleError ? (error.reconnect ? "auth" : "calendar") : "network";
    return back(`google=failed&reason=${reason}`);
  }
}
