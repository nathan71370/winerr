// src/price/service.ts
// Quote refresh orchestration. Mirrors src/catalog/drink-window.ts: never
// throws, lazy db imports (safe to import when DATABASE_URL is unset).
import { needsRefresh } from "./staleness";
import { lookupPrice } from "./lookup";
import type { AIConfig } from "@/ai/types";

// True when the config has both keys quote lookups need (Tavily search +
// Mistral extraction). Narrows `AIConfig | null` to `AIConfig` for callers.
export function hasQuoteKeys(config: AIConfig | null): config is AIConfig {
  return Boolean(config?.tavilyApiKey && config?.mistralApiKey);
}

export function refreshDays(): number {
  const n = Number(process.env.PRICE_REFRESH_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 30;
}

// Fetch + store a fresh quote for a wine, unless its latest snapshot is still
// fresh. A failed lookup stores an EMPTY snapshot (estimate null, source
// "none") so the attempt is timestamped and not retried before the next window.
// Callers are expected to gate on hasQuoteKeys(config) before calling.
export async function refreshWinePrice(wineId: string, config: AIConfig): Promise<void> {
  try {
    const { desc, eq } = await import("drizzle-orm");
    const { db } = await import("@/db");
    const { wines, priceSnapshots } = await import("@/db/schema");

    const wine = (await db.select().from(wines).where(eq(wines.id, wineId)).limit(1))[0];
    if (!wine) return;

    const latest = (await db
      .select({ fetchedAt: priceSnapshots.fetchedAt })
      .from(priceSnapshots)
      .where(eq(priceSnapshots.wineId, wineId))
      .orderBy(desc(priceSnapshots.fetchedAt))
      .limit(1))[0];
    if (!needsRefresh(latest?.fetchedAt ?? null, new Date(), refreshDays())) return;

    const quote = await lookupPrice({ producer: wine.producer, cuvee: wine.cuvee, vintage: wine.vintage }, config);
    if (quote) {
      await db.insert(priceSnapshots).values({
        wineId,
        estimate: String(quote.estimate),
        low: quote.low != null ? String(quote.low) : null,
        high: quote.high != null ? String(quote.high) : null,
        currency: quote.currency,
        source: quote.source,
      });
    } else {
      await db.insert(priceSnapshots).values({ wineId, estimate: null, source: "none" });
    }
  } catch (e) {
    console.error("[price] refresh failed", e);
  }
}
