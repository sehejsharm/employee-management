import "server-only";
import { createHmac } from "node:crypto";

/**
 * Launch tickets for the single Focus Realm website: short-lived, signed
 * proof that the Workspace just authenticated and authorized someone for the
 * HR console or the Sales CRM, handed off via /launch/hr and /launch/crm.
 *
 * Ticket: base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, that
 * first part)) — the HMAC covers the base64url TEXT of the payload, not the
 * raw JSON bytes. This exact format is verified on the HR console side by
 * lib/onboarding/hub.server.ts (sehejsharm/focusrealmhr); keep the two in sync.
 *
 * Payload: { v: 1, app: "hr" | "crm", sub: <employeeCode>, name: <full name>,
 * role: <Role>, iat: <now, seconds>, exp: <now + TICKET_LIFETIME_SECONDS> }.
 */
export type LaunchApp = "hr" | "crm";

export const TICKET_LIFETIME_SECONDS = 60;

export interface LaunchPayload {
  v: 1;
  app: LaunchApp;
  sub: string;
  name: string;
  role: string;
  iat: number;
  exp: number;
}

/** Signs a launch ticket for `person` into `app`, valid for TICKET_LIFETIME_SECONDS. */
export function signLaunchTicket(secret: string, app: LaunchApp, person: { employeeCode: string; name: string; role: string }): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload: LaunchPayload = {
    v: 1,
    app,
    sub: person.employeeCode,
    name: person.name,
    role: person.role,
    iat,
    exp: iat + TICKET_LIFETIME_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}
