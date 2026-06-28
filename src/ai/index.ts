import { createGeminiProvider } from "./gemini";
import type { AIProvider } from "./types";

export function isAIEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

// Returns the configured AI provider, or null when no key is set (the app
// stays usable: manual entry + name search; drink windows show "—").
export function getAIProvider(): AIProvider | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return createGeminiProvider({ apiKey, model: process.env.GEMINI_MODEL });
}
