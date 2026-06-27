import { describe, it, expect } from "vitest";
import { registerSchema } from "@/lib/validation";

describe("registerSchema", () => {
  it("accepts a valid registration", () => {
    const r = registerSchema.safeParse({ email: "a@b.com", password: "longenough", name: "Nathan" });
    expect(r.success).toBe(true);
  });

  it("rejects a bad email", () => {
    const r = registerSchema.safeParse({ email: "nope", password: "longenough", name: "X" });
    expect(r.success).toBe(false);
  });

  it("rejects a short password", () => {
    const r = registerSchema.safeParse({ email: "a@b.com", password: "short", name: "X" });
    expect(r.success).toBe(false);
  });
});
