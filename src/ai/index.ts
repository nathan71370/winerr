import { createGeminiProvider } from "./gemini";
import { createMistralProvider } from "./mistral";
import type { AIProvider } from "./types";

function selectedProvider(): "gemini" | "mistral" {
  return process.env.AI_PROVIDER === "mistral" ? "mistral" : "gemini";
}

export function isAIEnabled(): boolean {
  return !!getAIProvider();
}

// Returns the configured AI provider, or null when its key is unset (the app
// stays usable: manual entry + name search; drink windows show "—").
export function getAIProvider(): AIProvider | null {
  if (selectedProvider() === "mistral") {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) return null;
    return createMistralProvider({ apiKey, model: process.env.MISTRAL_MODEL });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return createGeminiProvider({ apiKey, model: process.env.GEMINI_MODEL });
}
