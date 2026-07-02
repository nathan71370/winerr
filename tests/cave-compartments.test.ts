import { describe, it, expect } from "vitest";
import { compartmentKeys, isValidCompartment, type Unit } from "@/cave/compartments";

const diamond: Unit = { kind: "diamond", cols: 2, rows: 2 };
const grid: Unit = { kind: "grid", cols: 3, rows: 2 };

describe("compartmentKeys", () => {
  it("returns cols×rows diamonds (D{a}-{b}) then 8 corner half-triangles", () => {
    expect(compartmentKeys(diamond)).toEqual([
      "D0-0", "D1-0", "D0-1", "D1-1",
      "CTL1", "CTL2", "CTR1", "CTR2", "CBR1", "CBR2", "CBL1", "CBL2",
    ]);
  });
  it("returns row-major L{r}C{c} keys for a grid", () => {
    expect(compartmentKeys(grid)).toEqual(["L1C1", "L1C2", "L1C3", "L2C1", "L2C2", "L2C3"]);
  });
  it("returns no keys when dimensions are missing", () => {
    expect(compartmentKeys({ kind: "grid", cols: null, rows: null })).toEqual([]);
    expect(compartmentKeys({ kind: "diamond", cols: null, rows: null })).toEqual([]);
  });
});

describe("isValidCompartment", () => {
  it("accepts a legal key and rejects an illegal one", () => {
    expect(isValidCompartment(diamond, "D1-1")).toBe(true);
    expect(isValidCompartment(diamond, "CTL1")).toBe(true);
    expect(isValidCompartment(diamond, "CTL")).toBe(false); // old whole-corner key now invalid
    expect(isValidCompartment(diamond, "D2-0")).toBe(false); // a out of range
    expect(isValidCompartment(diamond, "CXX")).toBe(false);
    expect(isValidCompartment(diamond, "L1C1")).toBe(false);
    expect(isValidCompartment(grid, "L2C3")).toBe(true);
    expect(isValidCompartment(grid, "D0-0")).toBe(false);
  });
});
