import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-for-crypto";
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret", () => {
    const payload = encryptSecret("sk-abc-123");
    expect(payload).not.toContain("sk-abc-123");
    expect(decryptSecret(payload)).toBe("sk-abc-123");
  });
  it("uses a fresh IV each time (distinct payloads, same plain)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });
  it("returns null on tampered or garbage payloads", () => {
    const payload = encryptSecret("secret");
    const [iv, tag, data] = payload.split(":");
    const tampered = `${iv}:${tag}:${Buffer.from("xxxx").toString("base64")}${data.slice(4)}`;
    expect(decryptSecret(tampered)).toBeNull();
    expect(decryptSecret("not-a-payload")).toBeNull();
  });
});
