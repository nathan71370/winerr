import { describe, it, expect } from "vitest";
import { labelExtractionSchema, drinkWindowSchema } from "@/ai/types";

describe("labelExtractionSchema (tolerant of LLM variance)", () => {
  it("accepts a clean full extraction", () => {
    const r = labelExtractionSchema.safeParse({
      producer: "Château Margaux", cuvee: null, vintage: 2015, region: "Margaux",
      country: "France", color: "rouge", grapes: "Cabernet Sauvignon", confidence: 0.9,
    });
    expect(r.success).toBe(true);
  });

  it("joins a grapes ARRAY into a string (Mistral returns arrays)", () => {
    const r = labelExtractionSchema.safeParse({ grapes: ["Cabernet Franc", "Merlot"], confidence: 0.8 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.grapes).toBe("Cabernet Franc, Merlot");
  });

  it("coerces a numeric-string vintage", () => {
    const r = labelExtractionSchema.safeParse({ vintage: "2021", confidence: 0.7 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.vintage).toBe(2021);
  });

  it("coerces an unknown color to null instead of failing", () => {
    const r = labelExtractionSchema.safeParse({ color: "purple", confidence: 0.5 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.color).toBeNull();
  });

  it("normalizes a percentage confidence (80 -> 0.8) and clamps", () => {
    const a = labelExtractionSchema.safeParse({ confidence: 80 });
    expect(a.success && a.data.confidence).toBe(0.8);
    const b = labelExtractionSchema.safeParse({ confidence: "0.9" });
    expect(b.success && b.data.confidence).toBe(0.9);
  });

  it("defaults a missing confidence to 0.5 and nulls the rest", () => {
    const r = labelExtractionSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.confidence).toBe(0.5);
      expect(r.data.producer).toBeNull();
      expect(r.data.color).toBeNull();
      expect(r.data.grapes).toBeNull();
    }
  });
});

describe("drinkWindowSchema (tolerant)", () => {
  it("accepts numbers", () => {
    expect(drinkWindowSchema.safeParse({ from: 2026, to: 2032, confidence: 0.7 }).success).toBe(true);
  });
  it("coerces numeric-string years", () => {
    const r = drinkWindowSchema.safeParse({ from: "2026", to: "2032", confidence: "0.6" });
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.from).toBe(2026); expect(r.data.to).toBe(2032); }
  });
  it("defaults a missing confidence to 0.5", () => {
    const r = drinkWindowSchema.safeParse({ from: 2026, to: 2032 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.confidence).toBe(0.5);
  });
  it("still fails when a year is missing/unparseable", () => {
    expect(drinkWindowSchema.safeParse({ from: 2026, confidence: 0.5 }).success).toBe(false);
    expect(drinkWindowSchema.safeParse({ from: 2026, to: "soon", confidence: 0.5 }).success).toBe(false);
  });
});
