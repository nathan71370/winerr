import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import type { AIConfig } from "@/ai/types";

// The user's decrypted AI config, or null when nothing usable is configured.
// A decryption failure (e.g. AUTH_SECRET changed) degrades to "not configured".
export async function getUserAIConfig(userId: string): Promise<AIConfig | null> {
  const row = (await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1))[0];
  if (!row) return null;
  const config: AIConfig = {
    provider: row.aiProvider === "gemini" ? "gemini" : "mistral",
    mistralApiKey: row.mistralApiKey ? decryptSecret(row.mistralApiKey) : null,
    geminiApiKey: row.geminiApiKey ? decryptSecret(row.geminiApiKey) : null,
    tavilyApiKey: row.tavilyApiKey ? decryptSecret(row.tavilyApiKey) : null,
  };
  return config.mistralApiKey || config.geminiApiKey || config.tavilyApiKey ? config : null;
}

// Which keys are configured (booleans only — never echoes values). For the form.
export async function getSettingsState(userId: string) {
  const row = (await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1))[0];
  return {
    provider: row?.aiProvider === "gemini" ? ("gemini" as const) : ("mistral" as const),
    hasMistral: !!row?.mistralApiKey,
    hasGemini: !!row?.geminiApiKey,
    hasTavily: !!row?.tavilyApiKey,
  };
}
