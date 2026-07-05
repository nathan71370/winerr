import { getAIProvider } from "@/ai";
import type { AIConfig } from "@/ai/types";

const STALE_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

// Pure: does this wine need its drink window (re)computed?
export function needsDrinkWindow(
  wine: { drinkFrom: number | null; drinkWindowFetchedAt: Date | null },
  now: Date,
): boolean {
  if (wine.drinkFrom == null) return true;
  if (!wine.drinkWindowFetchedAt) return true;
  return now.getTime() - wine.drinkWindowFetchedAt.getTime() > STALE_MS;
}

// Fire-and-forget: estimate + cache the drink window for a wine. No-op when the
// provider is unconfigured or the window is fresh. Never throws (logs instead).
export async function refreshDrinkWindow(wineId: string, config: AIConfig | null): Promise<void> {
  try {
    const provider = getAIProvider(config);
    if (!provider) return;

    // Lazy imports to avoid throwing at module-load time when DATABASE_URL is unset
    const { eq } = await import("drizzle-orm");
    const { db } = await import("@/db");
    const { wines } = await import("@/db/schema");

    const wine = (await db.select().from(wines).where(eq(wines.id, wineId)).limit(1))[0];
    if (!wine) return;
    if (!needsDrinkWindow(wine, new Date())) return;

    const w = await provider.estimateDrinkWindow({
      producer: wine.producer,
      cuvee: wine.cuvee,
      vintage: wine.vintage,
      region: wine.region,
      color: wine.color,
      grapes: wine.grapes,
    });
    if (!w) return;
    await db
      .update(wines)
      .set({
        drinkFrom: w.from,
        drinkTo: w.to,
        drinkWindowConfidence: String(w.confidence),
        drinkWindowSource: "gemini",
        drinkWindowFetchedAt: new Date(),
      })
      .where(eq(wines.id, wineId));
  } catch (e) {
    console.error("[drink-window] refresh failed", e);
  }
}
