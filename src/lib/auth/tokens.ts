import { createHash, randomBytes } from "node:crypto";

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** "__Host-" binds the cookie to this exact origin over HTTPS; plain name in local dev over http. */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-fr_session" : "fr_session";
