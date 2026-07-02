import { describe, it, expect } from "vitest";
import { needsRefresh } from "@/price/staleness";

const now = new Date("2026-07-02T12:00:00Z");

describe("needsRefresh", () => {
  it("is true when never fetched", () => {
    expect(needsRefresh(null, now, 30)).toBe(true);
  });
  it("is false within the window", () => {
    expect(needsRefresh(new Date("2026-06-10T12:00:00Z"), now, 30)).toBe(false);
  });
  it("is true past the window", () => {
    expect(needsRefresh(new Date("2026-05-01T12:00:00Z"), now, 30)).toBe(true);
  });
  it("honors a custom window", () => {
    expect(needsRefresh(new Date("2026-06-24T12:00:00Z"), now, 7)).toBe(true);
    expect(needsRefresh(new Date("2026-06-27T12:00:00Z"), now, 7)).toBe(false);
  });
});
