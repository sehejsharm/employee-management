/**
 * Google Calendar + Meet settings. All server-only; nothing here reaches the
 * browser. With GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET unset the calendar
 * features show setup instructions instead of failing.
 *
 * The *_URL overrides exist for tests (a local fake Google); leave them unset.
 */
import { config } from "@/lib/env";

/** Lets the app set who can join a Meet link — "open", so guests get in without knocking. */
export const MEET_SETTINGS_SCOPE = "https://www.googleapis.com/auth/meetings.space.settings";

export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar", MEET_SETTINGS_SCOPE];

export const googleConfig = {
  clientId: () => process.env.GOOGLE_CLIENT_ID?.trim() || "",
  clientSecret: () => process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
  configured: () => !!(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()),
  redirectUri: () => `${config.appUrl()}/api/google/callback`,
  authUrl: () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
  apiBase: () => (process.env.GOOGLE_API_BASE || "https://www.googleapis.com").replace(/\/$/, ""),
  meetApiBase: () => (process.env.GOOGLE_MEET_API_BASE || "https://meet.googleapis.com").replace(/\/$/, ""),
  /** The shared calendar created in the team account the first time it connects. */
  teamCalendarName: () => process.env.GOOGLE_TEAM_CALENDAR_NAME?.trim() || "Focus Realm Team",
};

/** Short-lived cookie tying the consent screen to the founder who started it. */
export const OAUTH_COOKIE = "fr_google_oauth";
