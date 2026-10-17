import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const update = vi.fn().mockResolvedValue({});
vi.mock("@/lib/db", () => ({ db: { googleConnection: { update: (...a: unknown[]) => update(...a) } } }));

const { canOpenMeetings, openMeetLink } = await import("@/lib/google/calendar");
const { sealToken } = await import("@/lib/google/crypto");

const CAL = "https://www.googleapis.com/auth/calendar";
const MEET = "https://www.googleapis.com/auth/meetings.space.settings";

function conn(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    kind: "TEAM",
    calendarId: "team@group.calendar.google.com",
    accessToken: sealToken("tok"),
    accessTokenExpiresAt: new Date(Date.now() + 3600_000),
    refreshToken: sealToken("refresh"),
    scopes: `${CAL} ${MEET}`,
    meetError: null,
    ...over,
  } as never;
}

describe("open Meet links", () => {
  const calls: { method: string; url: string; body?: string }[] = [];
  let space = { name: "spaces/abc123", config: { accessType: "TRUSTED" } };

  beforeEach(() => {
    process.env.GOOGLE_TOKEN_KEY = "test-key-for-unit-tests";
    calls.length = 0;
    update.mockClear();
    space = { name: "spaces/abc123", config: { accessType: "TRUSTED" } };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ method: init.method ?? "GET", url, body: init.body as string | undefined });
        if (init.method === "PATCH") space.config.accessType = JSON.parse(init.body as string).config.accessType;
        return new Response(JSON.stringify(space), { status: 200 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("knows whether the account gave the Meet permission", () => {
    expect(canOpenMeetings({ scopes: `${CAL} ${MEET}` })).toBe(true);
    expect(canOpenMeetings({ scopes: CAL })).toBe(false);
    expect(canOpenMeetings({ scopes: null })).toBe(false);
  });

  it("looks the space up by its meeting code and makes it open", async () => {
    expect(await openMeetLink(conn(), "https://meet.google.com/abc-defg-hij?authuser=0")).toBe(true);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET https://meet.googleapis.com/v2/spaces/abc-defg-hij",
      "PATCH https://meet.googleapis.com/v2/spaces/abc123?updateMask=config.accessType",
    ]);
    expect(JSON.parse(calls[1].body!)).toEqual({ config: { accessType: "OPEN" } });
  });

  it("leaves an already-open space alone", async () => {
    space.config.accessType = "OPEN";
    expect(await openMeetLink(conn(), "https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("does nothing without the permission or a Meet link", async () => {
    expect(await openMeetLink(conn({ scopes: CAL }), "https://meet.google.com/abc-defg-hij")).toBe(false);
    expect(await openMeetLink(conn(), "https://zoom.us/j/123")).toBe(false);
    expect(await openMeetLink(conn(), null)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("never throws, and keeps Google's reason for the Calendar page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Google Meet REST API has not been used in project 1." } }), { status: 403 })));
    expect(await openMeetLink(conn(), "https://meet.google.com/abc-defg-hij")).toBe(false);
    expect(update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { meetError: "Google Meet REST API has not been used in project 1." } });
  });
});

describe("open Meet links — old links", () => {
  it("skips a space that no longer exists without flagging the connection", async () => {
    process.env.GOOGLE_TOKEN_KEY = "test-key-for-unit-tests";
    update.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Space not found" } }), { status: 404 })));
    expect(await openMeetLink(conn({ meetError: null }), "https://meet.google.com/abc-defg-hij")).toBe(false);
    expect(update).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
