import { describe, it, expect } from "vitest";
import { todayLocalISO } from "@/lib/dates";

describe("todayLocalISO", () => {
  it("formats the Paris-local day as YYYY-MM-DD", () => {
    // 23:30 UTC on Jan 1 is already Jan 2 in Paris (UTC+1 in winter)
    expect(todayLocalISO(new Date("2026-01-01T23:30:00Z"))).toBe("2026-01-02");
    // 00:30 UTC in summer (UTC+2) is the same calendar day in Paris
    expect(todayLocalISO(new Date("2026-07-02T00:30:00Z"))).toBe("2026-07-02");
    // and 22:30 UTC in summer is already the next Paris day
    expect(todayLocalISO(new Date("2026-07-02T22:30:00Z"))).toBe("2026-07-03");
  });
});
