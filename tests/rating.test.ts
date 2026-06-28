import { describe, it, expect } from "vitest";
import { snapRating, starFills } from "@/reviews/rating";

describe("snapRating", () => {
  it("rounds to the nearest half", () => {
    expect(snapRating(3.4)).toBe(3.5);
    expect(snapRating(2.2)).toBe(2);
    expect(snapRating(4.75)).toBe(5);
  });
  it("clamps to [0.5, 5]", () => {
    expect(snapRating(0)).toBe(0.5);
    expect(snapRating(-3)).toBe(0.5);
    expect(snapRating(6)).toBe(5);
  });
});

describe("starFills", () => {
  it("describes each of 5 stars for a half rating", () => {
    expect(starFills(3.5)).toEqual(["full", "full", "full", "half", "empty"]);
  });
  it("handles whole and zero", () => {
    expect(starFills(5)).toEqual(["full", "full", "full", "full", "full"]);
    expect(starFills(0)).toEqual(["empty", "empty", "empty", "empty", "empty"]);
    expect(starFills(1)).toEqual(["full", "empty", "empty", "empty", "empty"]);
  });
});
