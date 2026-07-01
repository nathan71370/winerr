import { describe, it, expect } from "vitest";
import { compartmentKeys, isValidCompartment, type Unit } from "@/cave/compartments";

const diamond: Unit = { kind: "diamond", cols: 2, rows: 2 };
const grid: Unit = { kind: "grid", cols: 3, rows: 2 };

describe("compartmentKeys", () => {
  it("returns diamond bins at even-sum lattice points (D{i}-{j}), row-major", () => {
    expect(compartmentKeys(diamond)).toEqual(["D0-0", "D2-0", "D1-1", "D0-2", "D2-2"]);
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
    expect(isValidCompartment(diamond, "D1-1")).toBe(true);   // interior diamond
    expect(isValidCompartment(diamond, "D0-0")).toBe(true);   // corner triangle
    expect(isValidCompartment(diamond, "D1-0")).toBe(false);  // odd sum → no bin
    expect(isValidCompartment(diamond, "D3-1")).toBe(false);  // i out of range
    expect(isValidCompartment(diamond, "L1C1")).toBe(false);
    expect(isValidCompartment(grid, "L2C3")).toBe(true);
    expect(isValidCompartment(grid, "D1-1")).toBe(false);
  });
});
