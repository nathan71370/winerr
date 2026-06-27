import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema } from "@/lib/validation";

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

describe("loginSchema", () => {
  it("accepts a 1-char password (unlike register)", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "x" });
    expect(r.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(r.success).toBe(false);
  });
});
