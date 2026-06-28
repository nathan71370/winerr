import { describe, it, expect, afterEach } from "vitest";
import { getAIProvider, isAIEnabled } from "@/ai";

const original = process.env.GEMINI_API_KEY;
afterEach(() => {
  if (original === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = original;
});

describe("AI provider factory", () => {
  it("is disabled and returns null when no key is set", () => {
    delete process.env.GEMINI_API_KEY;
    expect(isAIEnabled()).toBe(false);
    expect(getAIProvider()).toBeNull();
  });
  it("is enabled and returns a provider when a key is set", () => {
    process.env.GEMINI_API_KEY = "KEY";
    expect(isAIEnabled()).toBe(true);
    const p = getAIProvider();
    expect(p).not.toBeNull();
    expect(typeof p?.identifyLabel).toBe("function");
  });
});
