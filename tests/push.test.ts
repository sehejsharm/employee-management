import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

const { safeHref } = await import("@/lib/push");

describe("safeHref", () => {
  it("keeps Workspace paths and https links", () => {
    expect(safeHref("/tasks/abc")).toBe("/tasks/abc");
    expect(safeHref("https://meet.google.com/abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("sends anything else to the inbox", () => {
    expect(safeHref(null)).toBe("/notifications");
    expect(safeHref("//evil.example/phish")).toBe("/notifications");
    expect(safeHref("javascript:alert(1)")).toBe("/notifications");
    expect(safeHref("http://insecure.example")).toBe("/notifications");
  });
});
