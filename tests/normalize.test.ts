import { describe, it, expect } from "vitest";
import { normalize } from "@/lib/normalize";

describe("normalize", () => {
  it("lowercases, strips accents, collapses whitespace, trims", () => {
    expect(normalize("  Château   Margaux ")).toBe("chateau margaux");
  });
  it("removes punctuation", () => {
    expect(normalize("Pavillon-Rouge, du Château!")).toBe("pavillon rouge du chateau");
  });
  it("returns empty string for nullish", () => {
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
  });
});
