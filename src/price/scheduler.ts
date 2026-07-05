// src/price/scheduler.ts
// In-process quote refresher. Started once from instrumentation.ts on boot
// (long-lived Docker process — NOT serverless-safe, same caveat as the other
// fire-and-forget jobs). A sweep is one cheap SQL scan per user; API quota is
// only spent on wines whose snapshot is older than PRICE_REFRESH_DAYS, using
// THAT user's own encrypted keys.
import { refreshDays } from "./service";

const SWEEP_MS = 6 * 60 * 60 * 1000; // 6 h between sweeps
const FIRST_SWEEP_MS = 60 * 1000;    // first sweep ~1 min after boot
const MAX_PER_SWEEP = 25;            // cap per USER per sweep (quota hygiene)
const PAUSE_MS = 3000;               // pause between refreshes (rate-limit friendly)

let started = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Quotes are now per-account keys, not a single instance-wide key: each user
// with quote-capable keys (Tavily + Mistral) gets their own sweep over the
// wines currently in THEIR cellar, refreshed with THEIR keys. Shared wines
// already refreshed (by this user or another key-holder) are skipped by the
// existing staleness gate inside refreshWinePrice. Never throws — errors are
// logged per user/wine so one bad key/wine doesn't abort the whole sweep.
async function sweep(): Promise<void> {
  try {
    const { eq, and, inArray } = await import("drizzle-orm");
    const { db } = await import("@/db");
    const { userSettings, cellarItems, priceSnapshots } = await import("@/db/schema");
    const { getUserAIConfig } = await import("@/settings/queries");
    const { hasQuoteKeys, refreshWinePrice } = await import("./service");
    const { needsRefresh } = await import("./staleness");

    const users = await db.select({ userId: userSettings.userId }).from(userSettings);
    const days = refreshDays();

    for (const { userId } of users) {
      try {
        const config = await getUserAIConfig(userId);
        if (!hasQuoteKeys(config)) continue;

        const rows = await db
          .selectDistinct({ wineId: cellarItems.wineId })
          .from(cellarItems)
          .where(and(eq(cellarItems.userId, userId), eq(cellarItems.status, "in_cellar")));
        const wineIds = rows.map((r) => r.wineId);
        if (wineIds.length === 0) continue;

        const snapshots = await db
          .select({ wineId: priceSnapshots.wineId, fetchedAt: priceSnapshots.fetchedAt })
          .from(priceSnapshots)
          .where(inArray(priceSnapshots.wineId, wineIds))
          .orderBy(priceSnapshots.fetchedAt);
        const latestByWine = new Map<string, Date>();
        for (const s of snapshots) latestByWine.set(s.wineId, s.fetchedAt);

        const now = new Date();
        const stale = wineIds.filter((wineId) => needsRefresh(latestByWine.get(wineId) ?? null, now, days));
        const batch = stale.slice(0, MAX_PER_SWEEP);

        for (const wineId of batch) {
          await refreshWinePrice(wineId, config);
          await sleep(PAUSE_MS);
        }
      } catch (e) {
        console.error("[price] sweep failed for user", userId, e);
      }
    }
  } catch (e) {
    console.error("[price] sweep failed", e);
  }
}

// Always starts (no boot gate): keys are per-user now, so there's no single
// instance-wide flag to check at boot — a sweep with no quote-capable users
// simply does nothing (cheap: one SELECT on user_settings).
export function startPriceScheduler(): void {
  if (started) return;
  started = true;
  setTimeout(() => void sweep(), FIRST_SWEEP_MS);
  setInterval(() => void sweep(), SWEEP_MS);
  console.log(`[price] scheduler started (refresh every ${refreshDays()} days, sweep every 6 h)`);
}
