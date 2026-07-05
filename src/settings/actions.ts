"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { requireUserId } from "@/auth/require-user";
import { settingsSchema } from "@/lib/validation";
import { encryptSecret } from "@/lib/crypto";

// Upsert the user's AI settings. Semantics per key: filled field → replace
// (encrypted); "clear" checked → remove; empty field → keep the existing key.
export async function saveSettingsAction(_prev: unknown, formData: FormData) {
  const userId = await requireUserId();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Réglages invalides." };
  const d = parsed.data;

  const enc = (v: string | undefined) => (v ? encryptSecret(v.trim()) : undefined);
  const patch: Record<string, unknown> = { aiProvider: d.aiProvider, updatedAt: new Date() };

  if (d.clearMistral) {
    patch.mistralApiKey = null;
  } else {
    const v = enc(d.mistralApiKey);
    if (v) patch.mistralApiKey = v;
  }
  if (d.clearGemini) {
    patch.geminiApiKey = null;
  } else {
    const v = enc(d.geminiApiKey);
    if (v) patch.geminiApiKey = v;
  }
  if (d.clearTavily) {
    patch.tavilyApiKey = null;
  } else {
    const v = enc(d.tavilyApiKey);
    if (v) patch.tavilyApiKey = v;
  }

  await db
    .insert(userSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: userSettings.userId, set: patch });

  revalidatePath("/settings");
  return { ok: true };
}
