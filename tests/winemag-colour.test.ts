import { describe, it, expect } from "vitest";
import { deriveColour } from "@/winemag/colour";

describe("deriveColour", () => {
  it("maps common reds", () => {
    expect(deriveColour("Pinot Noir")).toBe("Red");
    expect(deriveColour("Cabernet Sauvignon")).toBe("Red");
    expect(deriveColour("Red Blend")).toBe("Red");
    expect(deriveColour("Portuguese Red")).toBe("Red");
  });
  it("maps common whites", () => {
    expect(deriveColour("Chardonnay")).toBe("White");
    expect(deriveColour("Riesling")).toBe("White");
    expect(deriveColour("White Blend")).toBe("White");
  });
  it("maps rosé and sparkling", () => {
    expect(deriveColour("Rosé")).toBe("Rosé");
    expect(deriveColour("Champagne Blend")).toBe("Sparkling");
  });
  it("is case-insensitive and handles unknown/empty", () => {
    expect(deriveColour("pinot noir")).toBe("Red");
    expect(deriveColour("Some Obscure Grape")).toBeNull();
    expect(deriveColour(null)).toBeNull();
    expect(deriveColour("")).toBeNull();
  });
});
