import "server-only";
import { db } from "@/lib/db";
import type { GoogleConnection } from "@/generated/prisma/client";
import { googleConfig, GOOGLE_SCOPES } from "./config";
import { openToken, sealToken } from "./crypto";
import { eventBody, type EventInput, type GoogleEvent } from "./events";

/**
 * Google Calendar + Meet over plain REST. Each call runs as a connected Google
 * account: the team account for the shared calendar, or a founder's own.
 */

export class GoogleError extends Error {
  constructor(
    message: string,
    /** True when the stored login no longer works and someone must connect again. */
    public reconnect = false,
  ) {
    super(message);
  }
}

/* ----------------------------------------------------------------- OAuth -- */

export function consentUrl(state: string, loginHint?: string) {
  const url = new URL(googleConfig.authUrl());
  url.search = new URLSearchParams({
    client_id: googleConfig.clientId(),
    redirect_uri: googleConfig.redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    // Always ask, so Google always returns a refresh token.
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(googleConfig.tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: googleConfig.clientId(), client_secret: googleConfig.clientSecret(), ...params }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    const reconnect = json.error === "invalid_grant" || json.error === "unauthorized_client";
    throw new GoogleError(json.error_description || json.error || `Google sign-in failed (${res.status}).`, reconnect);
  }
  return json;
}

/** Swaps the code from the consent screen for tokens and finds which Google account it is. */
export async function exchangeCode(code: string) {
  const tokens = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: googleConfig.redirectUri() });
  if (!tokens.refresh_token) throw new GoogleError("Google didn't return a long-lived token. Remove the app's access in your Google account and connect again.");
  const primary = await rawApi<{ id: string; summary?: string }>(tokens.access_token, "GET", "/calendar/v3/calendars/primary");
  return {
    email: primary.id.toLowerCase(),
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt: new Date(Date.now() + (tokens.expires_in - 60) * 1000),
  };
}

/** A valid access token for a connection, refreshing (and storing) it when needed. */
async function accessToken(conn: GoogleConnection) {
  if (conn.accessToken && conn.accessTokenExpiresAt && conn.accessTokenExpiresAt.getTime() > Date.now() + 30_000) {
    try {
      return openToken(conn.accessToken);
    } catch {
      // Fall through and refresh.
    }
  }
  let refreshToken: string;
  try {
    refreshToken = openToken(conn.refreshToken);
  } catch {
    await markBroken(conn.id, "The stored Google login can't be read (the encryption key changed). Connect again.");
    throw new GoogleError("The Google connection needs to be set up again.", true);
  }
  try {
    const tokens = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
    await db.googleConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: sealToken(tokens.access_token),
        accessTokenExpiresAt: new Date(Date.now() + (tokens.expires_in - 60) * 1000),
        lastError: null,
        ...(tokens.refresh_token ? { refreshToken: sealToken(tokens.refresh_token) } : {}),
      },
    });
    return tokens.access_token;
  } catch (error) {
    if (error instanceof GoogleError && error.reconnect) {
      await markBroken(conn.id, "Google revoked access (or it expired). Connect again.");
    }
    throw error;
  }
}

async function markBroken(id: string, message: string) {
  await db.googleConnection.update({ where: { id }, data: { lastError: message, accessToken: null, accessTokenExpiresAt: null } }).catch(() => {});
}

/* ------------------------------------------------------------------- API -- */

async function rawApi<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${googleConfig.apiBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) {
    // 404/410: already gone (deleted, or never on this calendar) — fine for deletes.
    if ((res.status === 410 || res.status === 404) && method === "DELETE") return undefined as T;
    throw new GoogleError(json.error?.message || `Google Calendar error ${res.status}.`, res.status === 401);
  }
  return json;
}

async function api<T>(conn: GoogleConnection, method: string, path: string, body?: unknown) {
  return rawApi<T>(await accessToken(conn), method, path, body);
}

const cal = (id: string) => `/calendar/v3/calendars/${encodeURIComponent(id)}`;

/** Creates an event with a Meet link and emails invitations to every attendee. */
export async function createEvent(conn: GoogleConnection, input: EventInput) {
  return api<GoogleEvent>(conn, "POST", `${cal(conn.calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`, eventBody(input));
}

/** Cancels an event and tells everyone invited. */
export async function deleteEvent(conn: GoogleConnection, calendarId: string, eventId: string) {
  await api(conn, "DELETE", `${cal(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`);
}

/** Upcoming events on the connection's calendar. */
export async function listEvents(conn: GoogleConnection, from: Date, to: Date) {
  const q = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  const res = await api<{ items?: GoogleEvent[] }>(conn, "GET", `${cal(conn.calendarId)}/events?${q}`);
  return (res.items ?? []).filter((e) => e.status !== "cancelled");
}

/** When the connection's calendar is busy — only times, never what the events are. */
export async function busyTimes(conn: GoogleConnection, from: Date, to: Date) {
  const res = await api<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>(conn, "POST", "/calendar/v3/freeBusy", {
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    items: [{ id: conn.calendarId }],
  });
  return res.calendars?.[conn.calendarId]?.busy ?? [];
}

/** Finds the shared team calendar in the team account, creating it the first time. */
export async function ensureTeamCalendar(conn: GoogleConnection, timeZone: string) {
  const name = googleConfig.teamCalendarName();
  const list = await api<{ items?: { id: string; summary?: string; accessRole?: string }[] }>(conn, "GET", "/calendar/v3/users/me/calendarList?maxResults=250");
  const existing = list.items?.find((c) => c.summary === name && c.accessRole === "owner");
  if (existing) return { id: existing.id, name };
  const created = await api<{ id: string }>(conn, "POST", "/calendar/v3/calendars", {
    summary: name,
    description: "Team meetings arranged through the Focus Realm Workspace.",
    timeZone,
  });
  return { id: created.id, name };
}

/**
 * Lets each email see the team calendar (read-only) so it can be added in Google Calendar.
 * With `prune`, also removes read access from any address not in the list — so people who
 * left, or a calendar email someone has since changed, stop seeing the calendar. Owner and
 * writer rules are never touched.
 */
export async function shareCalendar(conn: GoogleConnection, emails: string[], opts: { prune?: boolean; add?: boolean } = {}) {
  const existing = await api<{ items?: { id?: string; role?: string; scope?: { type?: string; value?: string } }[] }>(conn, "GET", `${cal(conn.calendarId)}/acl`);
  const wanted = new Set(emails.map((e) => e.toLowerCase()));
  const already = new Set((existing.items ?? []).map((r) => r.scope?.value?.toLowerCase()).filter(Boolean));
  let removed = 0;
  if (opts.prune) {
    for (const rule of existing.items ?? []) {
      const email = rule.scope?.value?.toLowerCase();
      if (!rule.id || rule.role !== "reader" || rule.scope?.type !== "user" || !email || wanted.has(email)) continue;
      try {
        await api(conn, "DELETE", `${cal(conn.calendarId)}/acl/${encodeURIComponent(rule.id)}`);
        already.delete(email);
        removed += 1;
      } catch (e) {
        console.error("Couldn't remove team-calendar access", email, e);
      }
    }
  }
  let shared = 0;
  const failed: string[] = [];
  for (const email of opts.add === false ? [] : wanted) {
    if (already.has(email)) continue;
    try {
      await api(conn, "POST", `${cal(conn.calendarId)}/acl?sendNotifications=false`, { role: "reader", scope: { type: "user", value: email } });
      shared += 1;
    } catch {
      failed.push(email);
    }
  }
  return { shared, alreadyShared: already.size, failed, removed };
}

/** Tells Google to forget our access, best effort. */
export async function revoke(conn: GoogleConnection) {
  try {
    const token = openToken(conn.refreshToken);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(8_000) });
  } catch {
    // Nothing to do: the connection is removed either way.
  }
}

/* ---------------------------------------------------------------- Lookup -- */

export async function teamConnection() {
  return db.googleConnection.findUnique({ where: { teamKey: "team" } });
}

export async function personalConnection(userId: string) {
  return db.googleConnection.findUnique({ where: { userId } });
}

export { sealToken };
