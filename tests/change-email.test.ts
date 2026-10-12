import { describe, expect, it } from "vitest";
import { isAboveInReportingLine } from "@/lib/org";
import { canChangeEmail, type Actor } from "@/lib/permissions";

const edges = [
  { id: "founder", managerId: null },
  { id: "head", managerId: "founder" },
  { id: "lead", managerId: "head" },
  { id: "intern", managerId: "lead" },
  { id: "other", managerId: "founder" },
];

const actor = (id: string, role: Actor["role"] = "EMPLOYEE", canManagePeople = false): Actor => ({
  id,
  role,
  status: "ACTIVE",
  canAssignTasks: false,
  canManageOrg: false,
  canManagePeople,
});

describe("reporting line", () => {
  it("covers direct and indirect managers only", () => {
    expect(isAboveInReportingLine(edges, "lead", "intern")).toBe(true);
    expect(isAboveInReportingLine(edges, "head", "intern")).toBe(true);
    expect(isAboveInReportingLine(edges, "other", "intern")).toBe(false);
    expect(isAboveInReportingLine(edges, "intern", "lead")).toBe(false);
    expect(isAboveInReportingLine(edges, "intern", "intern")).toBe(false);
  });

  it("survives a loop in stored data", () => {
    expect(isAboveInReportingLine([{ id: "a", managerId: "b" }, { id: "b", managerId: "a" }], "c", "a")).toBe(false);
  });
});

describe("who can change an email", () => {
  const intern = { id: "intern", role: "INTERN" as const };
  it("lets founders, people admins and the reporting line change it", () => {
    expect(canChangeEmail(actor("founder", "FOUNDER"), intern, false)).toBe(true);
    expect(canChangeEmail(actor("hr", "EMPLOYEE", true), intern, false)).toBe(true);
    expect(canChangeEmail(actor("lead", "MANAGER"), intern, true)).toBe(true);
    expect(canChangeEmail(actor("other", "MANAGER"), intern, false)).toBe(false);
  });

  it("keeps founders' emails to founders, and doesn't let people change their own", () => {
    const founder = { id: "founder", role: "FOUNDER" as const };
    expect(canChangeEmail(actor("head", "MANAGER", true), founder, true)).toBe(false);
    expect(canChangeEmail(actor("founder2", "FOUNDER"), founder, false)).toBe(true);
    expect(canChangeEmail(actor("intern", "INTERN"), intern, false)).toBe(false);
  });
});
