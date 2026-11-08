import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { LaunchPayload } from "@/lib/hub/ticket";

vi.mock("server-only", () => ({}));
const getCurrentUser = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));

const { proxy } = await import("@/proxy");
const { GET: launchMail } = await import("@/app/launch/mail/route");

const SECRET = "test-hub-secret";
const MAIL = "https://mailmerge.example.com";
const BASE = "https://workspace.example.com";

const req = (path: string) => new NextRequest(new URL(path, BASE));
const user = (over: Record<string, unknown> = {}) => ({
  employeeCode: "FR-0042",
  firstName: "Dana",
  lastName: "Ross",
  email: "dana@focusrealm.com",
  role: "EMPLOYEE",
  status: "ACTIVE",
  mustChangePassword: false,
  ...over,
});

function decode(ticket: string) {
  const [body, sig] = ticket.split(".");
  expect(sig).toBe(createHmac("sha256", SECRET).update(body).digest("base64url"));
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LaunchPayload;
}

beforeEach(() => {
  process.env.FOCUS_REALM_HUB_SECRET = SECRET;
  process.env.MAILMERGE_ORIGIN = `${MAIL}/`;
  getCurrentUser.mockReset();
});
afterEach(() => {
  delete process.env.FOCUS_REALM_HUB_SECRET;
  delete process.env.MAILMERGE_ORIGIN;
});

describe("/mail routing", () => {
  it("rewrites /mail/* to Mail Merge with the /mail prefix stripped and the hub header added", () => {
    const res = proxy(req("/mail/campaigns/7?tab=sent"));
    expect(res.headers.get("x-middleware-rewrite")).toBe(`${MAIL}/campaigns/7?tab=sent`);
    expect(res.headers.get("x-middleware-request-x-focusrealm-hub")).toBe(SECRET);
  });

  it("maps /mail itself to Mail Merge's root", () => {
    expect(proxy(req("/mail")).headers.get("x-middleware-rewrite")).toBe(`${MAIL}/`);
  });

  it("leaves look-alike paths and an unset origin to the Workspace", () => {
    expect(proxy(req("/mailbox")).headers.get("x-middleware-rewrite")).toBeNull();
    delete process.env.MAILMERGE_ORIGIN;
    const res = proxy(req("/mail/x"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("location")).toContain("/login");
  });
});

describe("/launch/mail", () => {
  it("sends a signed-in teammate to /mail/sso with a valid \"mail\" ticket that carries their email", async () => {
    getCurrentUser.mockResolvedValue(user());
    const res = await launchMail(req("/launch/mail"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/mail/sso");
    const payload = decode(location.searchParams.get("launch")!);
    expect(payload).toMatchObject({ v: 1, app: "mail", sub: "FR-0042", name: "Dana Ross", role: "EMPLOYEE", email: "dana@focusrealm.com" });
    expect(payload.exp - payload.iat).toBe(60);
  });

  it("sends someone not signed in to the login page, coming back here", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await launchMail(req("/launch/mail"));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/launch/mail");
  });

  it("sends someone who must change their password to /welcome first", async () => {
    getCurrentUser.mockResolvedValue(user({ mustChangePassword: true }));
    expect(new URL((await launchMail(req("/launch/mail"))).headers.get("location")!).pathname).toBe("/welcome");
  });

  it("refuses someone who isn't active, and says so when Mail Merge isn't set up", async () => {
    getCurrentUser.mockResolvedValue(user({ status: "ON_LEAVE" }));
    expect((await launchMail(req("/launch/mail"))).status).toBe(403);
    delete process.env.MAILMERGE_ORIGIN;
    const res = await launchMail(req("/launch/mail"));
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Mail Merge isn't set up for this Workspace.");
  });
});
