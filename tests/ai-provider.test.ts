import { describe, it, expect } from "vitest";
import { getAIProvider, isAIEnabled } from "@/ai";
import type { AIConfig } from "@/ai/types";

describe("AI provider factory", () => {
  it("is disabled and returns null when config is null", () => {
    expect(isAIEnabled(null)).toBe(false);
    expect(getAIProvider(null)).toBeNull();
  });
  it("is disabled and returns null when the selected provider has no key", () => {
    const config: AIConfig = { provider: "gemini", geminiApiKey: null };
    expect(isAIEnabled(config)).toBe(false);
    expect(getAIProvider(config)).toBeNull();
  });
  it("is enabled and returns a provider when the gemini key is set", () => {
    const config: AIConfig = { provider: "gemini", geminiApiKey: "KEY" };
    expect(isAIEnabled(config)).toBe(true);
    const p = getAIProvider(config);
    expect(p).not.toBeNull();
    expect(typeof p?.identifyLabel).toBe("function");
  });
  it("selects Mistral when provider is mistral and mistralApiKey is set", () => {
    const config: AIConfig = { provider: "mistral", mistralApiKey: "MKEY" };
    expect(isAIEnabled(config)).toBe(true);
    expect(getAIProvider(config)).not.toBeNull();
  });
  it("returns null for mistral provider without a mistral key, even if gemini key is set", () => {
    const config: AIConfig = { provider: "mistral", mistralApiKey: null, geminiApiKey: "KEY" };
    expect(getAIProvider(config)).toBeNull();
  });
});
