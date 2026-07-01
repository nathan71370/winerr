import { describe, it, expect } from "vitest";
import { unitSchema, placeSchema, unplaceSchema } from "@/lib/validation";

describe("unitSchema", () => {
  it("requires dimensions for a diamond too", () => {
    expect(unitSchema.safeParse({ name: "Cube B", kind: "diamond", gridX: "1", gridY: "0" }).success).toBe(false);
    const r = unitSchema.safeParse({ name: "Cube B", kind: "diamond", cols: "2", rows: "3", gridX: "1", gridY: "0" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ cols: 2, rows: 3 });
  });
  it("coerces grid dimensions and position to ints", () => {
    const r = unitSchema.safeParse({ name: "Cube A", kind: "grid", cols: "4", rows: "4", gridX: "0", gridY: "1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ cols: 4, rows: 4, gridX: 0, gridY: 1 });
  });
  it("rejects an unknown kind and an empty name", () => {
    expect(unitSchema.safeParse({ name: "", kind: "grid", cols: "2", rows: "2", gridX: "0", gridY: "0" }).success).toBe(false);
    expect(unitSchema.safeParse({ name: "X", kind: "barrel", cols: "2", rows: "2", gridX: "0", gridY: "0" }).success).toBe(false);
  });
});

describe("placeSchema", () => {
  it("parses a placement with a positive quantity", () => {
    const r = placeSchema.safeParse({ cellarItemId: "i1", unitId: "u1", compartment: "N", quantity: "2" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quantity).toBe(2);
  });
  it("rejects a non-positive quantity", () => {
    expect(placeSchema.safeParse({ cellarItemId: "i1", unitId: "u1", compartment: "N", quantity: "0" }).success).toBe(false);
  });
});

describe("unplaceSchema", () => {
  it("requires a placement id", () => {
    expect(unplaceSchema.safeParse({ placementId: "p1" }).success).toBe(true);
    expect(unplaceSchema.safeParse({}).success).toBe(false);
  });
});
