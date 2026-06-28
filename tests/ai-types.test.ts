import { describe, it, expect } from "vitest";
import { labelExtractionSchema, drinkWindowSchema } from "@/ai/types";

describe("labelExtractionSchema", () => {
  it("accepts a full extraction", () => {
    const r = labelExtractionSchema.safeParse({
      producer: "Château Margaux", cuvee: null, vintage: 2015, region: "Margaux",
      country: "France", color: "rouge", grapes: "Cabernet Sauvignon", confidence: 0.9,
    });
    expect(r.success).toBe(true);
  });
  it("allows nulls for unknown fields but requires confidence", () => {
    const r = labelExtractionSchema.safeParse({
      producer: null, cuvee: null, vintage: null, region: null,
      country: null, color: null, grapes: null, confidence: 0.2,
    });
    expect(r.success).toBe(true);
  });
  it("rejects a bad color", () => {
    const r = labelExtractionSchema.safeParse({
      producer: "X", cuvee: null, vintage: null, region: null,
      country: null, color: "purple", grapes: null, confidence: 0.5,
    });
    expect(r.success).toBe(false);
  });
});

describe("drinkWindowSchema", () => {
  it("accepts from/to/confidence", () => {
    expect(drinkWindowSchema.safeParse({ from: 2026, to: 2032, confidence: 0.7 }).success).toBe(true);
  });
  it("rejects a missing field", () => {
    expect(drinkWindowSchema.safeParse({ from: 2026, to: 2032 }).success).toBe(false);
  });
});
