// src/price/scheduler.ts
// In-process quote refresher. Started once from instrumentation.ts on boot
// (long-lived Docker process — NOT serverless-safe, same caveat as the other
// fire-and-forget jobs). A sweep is one cheap SQL scan; API quota is only
// spent on wines whose snapshot is older than PRICE_REFRESH_DAYS.
import { needsRefresh } from "./staleness";
import { isPriceEnabled, refreshDays, refreshWinePrice } from "./service";
import { latestSnapshots } from "./queries";

const SWEEP_MS = 6 * 60 * 60 * 1000; // 6 h between sweeps
const FIRST_SWEEP_MS = 60 * 1000;    // first sweep ~1 min after boot
const MAX_PER_SWEEP = 25;            // cap quota bursts; backlog drains across sweeps
const PAUSE_MS = 3_000;              // politeness between lookups

let started = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sweep(): Promise<void> {
  try {
    // Wines someone still holds in-cellar — never spend quota on drunk-only wines.
    const { eq } = await import("drizzle-orm");
    const { db } = await import("@/db");
    const { cellarItems } = await import("@/db/schema");
    const held = await db
      .selectDistinct({ wineId: cellarItems.wineId })
      .from(cellarItems)
      .where(eq(cellarItems.status, "in_cellar"));
    const wineIds = held.map((r) => r.wineId);
    if (wineIds.length === 0) return;

    const latest = await latestSnapshots(wineIds);
    const days = refreshDays();
    const now = new Date();
    const stale = wineIds.filter((id) => needsRefresh(latest.get(id)?.fetchedAt ?? null, now, days));
    for (const wineId of stale.slice(0, MAX_PER_SWEEP)) {
      await refreshWinePrice(wineId);
      await sleep(PAUSE_MS);
    }
  } catch (e) {
    console.error("[price] sweep failed", e);
  }
}

export function startPriceScheduler(): void {
  if (started || !isPriceEnabled()) return;
  started = true;
  setTimeout(() => void sweep(), FIRST_SWEEP_MS);
  setInterval(() => void sweep(), SWEEP_MS);
  console.log(`[price] scheduler started (refresh every ${refreshDays()} days, sweep every 6 h)`);
}
