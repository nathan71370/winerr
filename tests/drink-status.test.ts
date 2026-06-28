import { describe, it, expect } from "vitest";
import { drinkStatus } from "@/cellar/drink-status";

describe("drinkStatus", () => {
  it("returns null when no window", () => {
    expect(drinkStatus(null, null, 2026)).toBeNull();
    expect(drinkStatus(2026, null, 2026)).toBeNull();
  });
  it("is 'young' before the window opens", () => {
    const s = drinkStatus(2030, 2040, 2026)!;
    expect(s.key).toBe("young");
    expect(s.label).toContain("Trop jeune");
    expect(s.color).toBe("var(--z1)");
  });
  it("is 'ready' inside the window, comfortably before the end", () => {
    const s = drinkStatus(2024, 2034, 2026)!;
    expect(s.key).toBe("ready");
    expect(s.color).toBe("var(--z2)");
  });
  it("is 'soon' within the last two years of the window", () => {
    const s = drinkStatus(2018, 2027, 2026)!;
    expect(s.key).toBe("soon");
    expect(s.label).toContain("2027");
    expect(s.color).toBe("var(--z4)");
  });
  it("is 'past' after the window closes", () => {
    const s = drinkStatus(2010, 2020, 2026)!;
    expect(s.key).toBe("past");
    expect(s.color).toBe("var(--z5)");
  });
});
