import { describe, it, expect } from "vitest";
import { wineEnrichmentSchema } from "@/ai/enrich-types";

describe("wineEnrichmentSchema (tolerant)", () => {
  it("parses a clean object", () => {
    const r = wineEnrichmentSchema.safeParse({
      region: "Bourgueil", country: "France", grapes: "Cabernet Franc",
      description: "Un rouge de Loire.", drinkFrom: 2023, drinkTo: 2030,
      priceEur: 18.5, imageUrl: "https://x/y.jpg",
    });
    expect(r.success).toBe(true);
  });
  it("joins a grapes array and coerces numeric strings", () => {
    const r = wineEnrichmentSchema.safeParse({ grapes: ["Cabernet Franc", "Merlot"], drinkFrom: "2023", drinkTo: "2030", priceEur: "18,50 €" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.grapes).toBe("Cabernet Franc, Merlot");
      expect(r.data.drinkFrom).toBe(2023);
      expect(r.data.priceEur).toBe(18.5);
    }
  });
  it("defaults everything to null on an empty object", () => {
    const r = wineEnrichmentSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.region).toBeNull(); expect(r.data.priceEur).toBeNull(); }
  });
});
