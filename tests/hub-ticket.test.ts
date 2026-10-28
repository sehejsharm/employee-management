import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { LaunchPayload } from "@/lib/hub/ticket";

vi.mock("server-only", () => ({}));
const { signLaunchTicket, TICKET_LIFETIME_SECONDS } = await import("@/lib/hub/ticket");

const secret = "test-hub-secret";
const person = { employeeCode: "FR-0042", name: "Dana Ross", role: "FOUNDER" };

/**
 * Re-implements the HR console's verifyLaunch() (focusrealmhr's
 * lib/onboarding/hub.server.ts) independently of signLaunchTicket, so this
 * test catches a drift between the two sides rather than just checking the
 * signer agrees with itself.
 */
function verify(ticket: string, withSecret: string): { ok: true; payload: LaunchPayload } | { ok: false } {
  const [body, sig] = ticket.split(".");
  if (!body || !sig) return { ok: false };
  const expected = createHmac("sha256", withSecret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LaunchPayload;
  return { ok: true, payload };
}

describe("launch ticket signing (matches focusrealmhr's hub.server.ts verifier)", () => {
  it("produces base64url(payload) + \".\" + base64url(HMAC-SHA256(secret, payload text))", () => {
    const ticket = signLaunchTicket(secret, "hr", person);
    const parts = ticket.split(".");
    expect(parts).toHaveLength(2);
    const [body, sig] = parts;
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sig).toBe(createHmac("sha256", secret).update(body).digest("base64url"));
  });

  it("verifies under an independent re-implementation of the HR console's check", () => {
    const ticket = signLaunchTicket(secret, "hr", person);
    const result = verify(ticket, secret);
    expect(result.ok).toBe(true);
  });

  it("carries the expected payload shape and claims", () => {
    const before = Math.floor(Date.now() / 1000);
    const ticket = signLaunchTicket(secret, "crm", person);
    const result = verify(ticket, secret);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      v: 1,
      app: "crm",
      sub: person.employeeCode,
      name: person.name,
      role: person.role,
    });
    expect(result.payload.iat).toBeGreaterThanOrEqual(before);
    expect(result.payload.exp - result.payload.iat).toBe(TICKET_LIFETIME_SECONDS);
  });

  it("fails verification under the wrong secret", () => {
    const ticket = signLaunchTicket(secret, "hr", person);
    expect(verify(ticket, "wrong-secret").ok).toBe(false);
  });

  it("fails verification once the body is tampered with", () => {
    const [, sig] = signLaunchTicket(secret, "hr", person).split(".");
    const tamperedPayload = { v: 1, app: "hr", sub: "FR-9999", name: "Eve", role: "FOUNDER", iat: 0, exp: 999999999999 };
    const tamperedBody = Buffer.from(JSON.stringify(tamperedPayload), "utf8").toString("base64url");
    expect(verify(`${tamperedBody}.${sig}`, secret).ok).toBe(false);
  });
});
