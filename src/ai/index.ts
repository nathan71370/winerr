import { createGeminiProvider } from "./gemini";
import { createMistralProvider } from "./mistral";
import type { AIConfig, AIProvider } from "./types";

// Model names stay optional env overrides (matches the pre-refactor factory);
// the providers themselves already default internally when no override is set.
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || undefined;
const GEMINI_MODEL = process.env.GEMINI_MODEL || undefined;

export function isAIEnabled(config: AIConfig | null): boolean {
  return !!getAIProvider(config);
}

// Returns the provider selected by the acting user's config, or null when
// unconfigured / the matching key is missing (the app stays usable: manual
// entry + name search; drink windows show "—").
export function getAIProvider(config: AIConfig | null): AIProvider | null {
  if (!config) return null;
  if (config.provider === "mistral") {
    if (!config.mistralApiKey) return null;
    return createMistralProvider({ apiKey: config.mistralApiKey, model: MISTRAL_MODEL });
  }
  if (!config.geminiApiKey) return null;
  return createGeminiProvider({ apiKey: config.geminiApiKey, model: GEMINI_MODEL });
}
