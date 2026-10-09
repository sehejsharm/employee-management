import { describe, expect, it } from "vitest";
import { buildForest, countDescendants, wouldCreateCycle } from "@/lib/org";

const edges = [
  { id: "ceo", managerId: null },
  { id: "coo", managerId: null },
  { id: "lead", managerId: "ceo" },
  { id: "ic", managerId: "lead" },
  { id: "intern", managerId: "ic" },
];

describe("org chart", () => {
  it("detects a person reporting to themselves or their own report", () => {
    expect(wouldCreateCycle(edges, "lead", "lead")).toBe(true);
    expect(wouldCreateCycle(edges, "ceo", "intern")).toBe(true);
    expect(wouldCreateCycle(edges, "lead", "ic")).toBe(true);
  });

  it("allows legitimate moves", () => {
    expect(wouldCreateCycle(edges, "intern", "coo")).toBe(false);
    expect(wouldCreateCycle(edges, "lead", null)).toBe(false);
    expect(wouldCreateCycle(edges, "ic", "ceo")).toBe(false);
  });

  it("builds a forest with every founder as a root", () => {
    const forest = buildForest(edges);
    expect(forest.map((n) => n.item.id)).toEqual(["ceo", "coo"]);
    expect(countDescendants(forest[0])).toBe(3);
  });

  it("never loses people caught in a corrupted loop", () => {
    const corrupt = [...edges, { id: "a", managerId: "b" }, { id: "b", managerId: "a" }];
    const forest = buildForest(corrupt);
    const seen = new Set<string>();
    const walk = (n: (typeof forest)[number]) => {
      seen.add(n.item.id);
      n.children.forEach(walk);
    };
    forest.forEach(walk);
    expect(seen.size).toBe(corrupt.length);
  });
});
