import { describe, it, expect } from "vitest";
import { compartmentId, groupContents, highlightSet } from "@/cave/group";

const rows = [
  { placementId: "p1", unitId: "u1", compartment: "N", quantity: 2, itemId: "i1", wineId: "w1", producer: "Léoni", cuvee: null, vintage: 2019, color: "rouge" },
  { placementId: "p2", unitId: "u1", compartment: "N", quantity: 1, itemId: "i2", wineId: "w2", producer: "Charme", cuvee: null, vintage: 2021, color: "rouge" },
  { placementId: "p3", unitId: "u2", compartment: "L1C1", quantity: 1, itemId: "i3", wineId: "w1", producer: "Léoni", cuvee: null, vintage: 2019, color: "rouge" },
];

describe("compartmentId", () => {
  it("joins unit + compartment stably", () => {
    expect(compartmentId("u1", "N")).toBe("u1:N");
  });
});

describe("groupContents", () => {
  it("groups placement rows by compartment id", () => {
    const g = groupContents(rows);
    expect(g.get("u1:N")?.length).toBe(2);
    expect(g.get("u2:L1C1")?.length).toBe(1);
    expect(g.get("u1:N")?.[0].producer).toBe("Léoni");
  });
});

describe("highlightSet", () => {
  it("builds the set of compartment ids holding a wine's placements", () => {
    const placements = [{ unitId: "u1", compartment: "N" }, { unitId: "u2", compartment: "L1C1" }];
    const s = highlightSet(placements);
    expect(s.has("u1:N")).toBe(true);
    expect(s.has("u2:L1C1")).toBe(true);
    expect(s.has("u1:E")).toBe(false);
  });
});
