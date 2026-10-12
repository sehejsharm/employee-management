import { describe, expect, it } from "vitest";
import { isAboveInReportingLine, withAdditionalLines, wouldCreateCycle } from "@/lib/org";

// founder ← head ← lead ← intern, and the intern also reports to "ops", who reports to the founder.
const people = [
  { id: "founder", managerId: null },
  { id: "head", managerId: "founder" },
  { id: "lead", managerId: "head" },
  { id: "intern", managerId: "lead" },
  { id: "ops", managerId: "founder" },
];
const edges = withAdditionalLines(people, [{ userId: "intern", managerId: "ops" }]);

describe("reporting to two people", () => {
  it("treats every boss and their bosses as above the person", () => {
    expect(isAboveInReportingLine(edges, "lead", "intern")).toBe(true);
    expect(isAboveInReportingLine(edges, "ops", "intern")).toBe(true);
    expect(isAboveInReportingLine(edges, "founder", "intern")).toBe(true);
    expect(isAboveInReportingLine(people, "ops", "intern")).toBe(false);
  });

  it("refuses loops through an additional line", () => {
    // ops now sits above intern, so ops can't report to intern.
    expect(wouldCreateCycle(edges, "ops", "intern")).toBe(true);
    expect(wouldCreateCycle(people, "ops", "intern")).toBe(false);
    // Nor can a second boss be someone below them.
    expect(wouldCreateCycle(edges, "head", "intern")).toBe(true);
    // Two bosses side by side is fine.
    expect(wouldCreateCycle(edges, "intern", "head")).toBe(false);
  });
});
