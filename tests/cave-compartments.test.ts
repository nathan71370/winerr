import { describe, it, expect } from "vitest";
import { compartmentKeys, isValidCompartment, type Unit } from "@/cave/compartments";

const diamond: Unit = { kind: "diamond", cols: 2, rows: 1 };
const grid: Unit = { kind: "grid", cols: 3, rows: 2 };

describe("compartmentKeys", () => {
  it("returns 4 triangle keys per cell for a diamond (row-major, N/E/S/O)", () => {
    expect(compartmentKeys(diamond)).toEqual([
      "L1C1N", "L1C1E", "L1C1S", "L1C1O",
      "L1C2N", "L1C2E", "L1C2S", "L1C2O",
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
    expect(isValidCompartment(diamond, "L1C1N")).toBe(true);
    expect(isValidCompartment(diamond, "L1C2O")).toBe(true);
    expect(isValidCompartment(diamond, "N")).toBe(false);        // old fixed key
    expect(isValidCompartment(diamond, "L1C1")).toBe(false);     // no direction
    expect(isValidCompartment(diamond, "L2C1N")).toBe(false);    // row out of range
    expect(isValidCompartment(grid, "L2C3")).toBe(true);
    expect(isValidCompartment(grid, "L2C3N")).toBe(false);
  });
});
