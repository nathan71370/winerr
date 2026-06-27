import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/auth/password";

describe("password", () => {
  it("hashes then verifies the same password", async () => {
    const hash = await hashPassword("monMotDePasse!");
    expect(hash).not.toBe("monMotDePasse!");
    expect(await verifyPassword("monMotDePasse!", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("monMotDePasse!");
    expect(await verifyPassword("mauvais", hash)).toBe(false);
  });
});
