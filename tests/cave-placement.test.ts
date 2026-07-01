import { describe, it, expect } from "vitest";
import { placedTotal, unplacedQuantity, canPlace, reconcilePlacements } from "@/cave/placement";

describe("placedTotal / unplacedQuantity", () => {
  it("sums placement quantities", () => {
    expect(placedTotal([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
    expect(placedTotal([])).toBe(0);
  });
  it("computes the unplaced remainder, never negative", () => {
    expect(unplacedQuantity(6, [{ quantity: 2 }, { quantity: 1 }])).toBe(3);
    expect(unplacedQuantity(2, [{ quantity: 5 }])).toBe(0);
  });
});

describe("canPlace", () => {
  it("allows placing within the unplaced remainder", () => {
    expect(canPlace(6, [{ quantity: 2 }], 4)).toBe(true);
    expect(canPlace(6, [{ quantity: 2 }], 5)).toBe(false);
  });
  it("rejects non-positive quantities", () => {
    expect(canPlace(6, [], 0)).toBe(false);
    expect(canPlace(6, [], -1)).toBe(false);
  });
});

describe("reconcilePlacements", () => {
  it("leaves placements untouched when within max", () => {
    expect(reconcilePlacements([{ id: "a", quantity: 2 }], 3)).toEqual([{ id: "a", quantity: 2 }]);
  });
  it("trims excess from the most recent placements first", () => {
    expect(reconcilePlacements([{ id: "a", quantity: 2 }, { id: "b", quantity: 2 }], 3))
      .toEqual([{ id: "a", quantity: 2 }, { id: "b", quantity: 1 }]);
  });
  it("zeroes everything when max is 0", () => {
    expect(reconcilePlacements([{ id: "a", quantity: 2 }, { id: "b", quantity: 1 }], 0))
      .toEqual([{ id: "a", quantity: 0 }, { id: "b", quantity: 0 }]);
  });
});
