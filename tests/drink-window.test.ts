import { describe, it, expect } from "vitest";
import { needsDrinkWindow } from "@/catalog/drink-window";

const now = new Date("2026-06-28T00:00:00Z");

describe("needsDrinkWindow", () => {
  it("needs one when never computed (drinkFrom null)", () => {
    expect(needsDrinkWindow({ drinkFrom: null, drinkWindowFetchedAt: null }, now)).toBe(true);
  });
  it("needs one when there's a value but no fetched timestamp", () => {
    expect(needsDrinkWindow({ drinkFrom: 2026, drinkWindowFetchedAt: null }, now)).toBe(true);
  });
  it("does NOT need one when computed recently", () => {
    const recent = new Date("2026-06-01T00:00:00Z");
    expect(needsDrinkWindow({ drinkFrom: 2026, drinkWindowFetchedAt: recent }, now)).toBe(false);
  });
  it("needs a refresh when older than the staleness window", () => {
    const old = new Date("2025-01-01T00:00:00Z");
    expect(needsDrinkWindow({ drinkFrom: 2026, drinkWindowFetchedAt: old }, now)).toBe(true);
  });
});
