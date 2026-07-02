import { describe, it, expect } from "vitest";
import { gainLossPct, cellarValue } from "@/price/valuation";

describe("gainLossPct", () => {
  it("computes signed percentage vs purchase", () => {
    expect(gainLossPct(12, 18)).toBe(50);
    expect(gainLossPct(20, 15)).toBe(-25);
  });
  it("rounds to the nearest integer", () => {
    expect(gainLossPct(30, 40)).toBe(33);
  });
  it("returns null for a non-positive purchase price", () => {
    expect(gainLossPct(0, 18)).toBeNull();
    expect(gainLossPct(-5, 18)).toBeNull();
  });
});

describe("cellarValue", () => {
  const rows = [
    { quantity: 2, purchasePrice: 10, estimate: 15 },   // 20 buy, 30 est
    { quantity: 1, purchasePrice: null, estimate: 40 }, // no buy, 40 est
    { quantity: 3, purchasePrice: 8, estimate: null },  // 24 buy, unquoted
  ];
  it("sums estimates and purchases independently", () => {
    expect(cellarValue(rows)).toEqual({ estimated: 70, purchase: 44, deltaPct: 59 });
  });
  it("has a null delta when there is no purchase total", () => {
    expect(cellarValue([{ quantity: 1, purchasePrice: null, estimate: 12 }])).toEqual({ estimated: 12, purchase: 0, deltaPct: null });
  });
  it("handles an empty cellar", () => {
    expect(cellarValue([])).toEqual({ estimated: 0, purchase: 0, deltaPct: null });
  });
});
