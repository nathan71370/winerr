import { describe, it, expect } from "vitest";
import { compartmentKeys, isValidCompartment, type Unit } from "@/cave/compartments";

const diamond: Unit = { kind: "diamond", cols: null, rows: null };
const grid: Unit = { kind: "grid", cols: 3, rows: 2 };

describe("compartmentKeys", () => {
  it("returns the four fixed compartments for a diamond", () => {
    expect(compartmentKeys(diamond)).toEqual(["N", "E", "S", "O"]);
  });
  it("returns row-major L{r}C{c} keys for a grid", () => {
    expect(compartmentKeys(grid)).toEqual(["L1C1", "L1C2", "L1C3", "L2C1", "L2C2", "L2C3"]);
  });
  it("returns no keys for a grid with missing dimensions", () => {
    expect(compartmentKeys({ kind: "grid", cols: null, rows: null })).toEqual([]);
  });
});

describe("isValidCompartment", () => {
  it("accepts a legal key and rejects an illegal one", () => {
    expect(isValidCompartment(diamond, "N")).toBe(true);
    expect(isValidCompartment(diamond, "L1C1")).toBe(false);
    expect(isValidCompartment(grid, "L2C3")).toBe(true);
    expect(isValidCompartment(grid, "L3C1")).toBe(false);
  });
});
