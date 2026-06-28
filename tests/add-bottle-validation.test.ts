import { describe, it, expect } from "vitest";
import { addBottleSchema } from "@/lib/validation";

const base = { producer: "Château Margaux", color: "rouge", quantity: 1 };

describe("addBottleSchema", () => {
  it("accepts a minimal valid bottle", () => {
    expect(addBottleSchema.safeParse(base).success).toBe(true);
  });
  it("coerces quantity and vintage from strings", () => {
    const r = addBottleSchema.safeParse({ ...base, quantity: "6", vintage: "2015" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.quantity).toBe(6);
      expect(r.data.vintage).toBe(2015);
    }
  });
  it("rejects a missing producer", () => {
    expect(addBottleSchema.safeParse({ ...base, producer: "" }).success).toBe(false);
  });
  it("rejects quantity < 1", () => {
    expect(addBottleSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
  });
  it("rejects an out-of-range color", () => {
    expect(addBottleSchema.safeParse({ ...base, color: "purple" }).success).toBe(false);
  });
});
