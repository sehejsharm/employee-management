import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

const { canEditMeeting } = await import("@/lib/meetings");

const founder = { id: "f1", role: "FOUNDER" };
const intern = { id: "i1", role: "INTERN" };
const colleague = { id: "c1", role: "EMPLOYEE" };

describe("who can edit a meeting", () => {
  it("lets whoever arranged a team meeting, or any founder, change it", () => {
    const team = { organizerId: "i1", hostId: null, instant: false };
    expect(canEditMeeting(intern, team)).toBe(true);
    expect(canEditMeeting(founder, team)).toBe(true);
    expect(canEditMeeting(colleague, team)).toBe(false);
  });

  it("leaves a meeting with a founder to founders", () => {
    const withFounder = { organizerId: "i1", hostId: "f1", instant: false };
    expect(canEditMeeting(founder, withFounder)).toBe(true);
    expect(canEditMeeting(intern, withFounder)).toBe(false);
  });

  it("never edits a Meet now call", () => {
    expect(canEditMeeting(founder, { organizerId: "f1", hostId: null, instant: true })).toBe(false);
  });
});
