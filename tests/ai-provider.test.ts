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
  it("selects Mistral when AI_PROVIDER=mistral and MISTRAL_API_KEY is set", () => {
    const origP = process.env.AI_PROVIDER, origK = process.env.MISTRAL_API_KEY;
    process.env.AI_PROVIDER = "mistral";
    process.env.MISTRAL_API_KEY = "MKEY";
    try {
      expect(isAIEnabled()).toBe(true);
      expect(getAIProvider()).not.toBeNull();
    } finally {
      if (origP === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = origP;
      if (origK === undefined) delete process.env.MISTRAL_API_KEY; else process.env.MISTRAL_API_KEY = origK;
    }
  });
});
