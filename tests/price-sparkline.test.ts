import { describe, it, expect } from "vitest";
import { sparklinePoints } from "@/price/sparkline";

describe("sparklinePoints", () => {
  it("maps a series onto the box, min at bottom, max at top", () => {
    expect(sparklinePoints([10, 20], 100, 30)).toBe("0,30 100,0");
  });
  it("draws a flat series at mid-height", () => {
    expect(sparklinePoints([15, 15, 15], 100, 30)).toBe("0,15 50,15 100,15");
  });
  it("returns an empty string for fewer than 2 points", () => {
    expect(sparklinePoints([12], 100, 30)).toBe("");
    expect(sparklinePoints([], 100, 30)).toBe("");
  });
});
