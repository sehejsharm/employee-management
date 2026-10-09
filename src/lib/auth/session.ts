import "server-only";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_COOKIE, createSessionToken, hashToken } from "./tokens";

const LONG_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;

function describeDevice(userAgent: string | null) {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "device";
  return `${browser} on ${os}`;
}

export async function startSession(userId: string, remember: boolean) {
  const token = createSessionToken();
  const ttl = remember ? LONG_SESSION_MS : SHORT_SESSION_MS;
  const expiresAt = new Date(Date.now() + ttl);
  const userAgent = (await headers()).get("user-agent");

  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, device: describeDevice(userAgent) },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Without "remember me" the cookie dies with the browser; the DB row expires in 12h regardless.
    ...(remember ? { expires: expiresAt } : {}),
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

export async function currentSessionTokenHash() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/** Signs a person out everywhere — used on deactivation, password reset and "sign out other devices". */
export async function revokeAllSessions(userId: string, exceptTokenHash?: string | null) {
  await db.session.deleteMany({
    where: { userId, ...(exceptTokenHash ? { NOT: { tokenHash: exceptTokenHash } } : {}) },
  });
}
