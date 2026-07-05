// src/price/scheduler.ts
// In-process quote refresher. Started once from instrumentation.ts on boot
// (long-lived Docker process — NOT serverless-safe, same caveat as the other
// fire-and-forget jobs). A sweep is one cheap SQL scan; API quota is only
// spent on wines whose snapshot is older than PRICE_REFRESH_DAYS.
import { refreshDays } from "./service";

const SWEEP_MS = 6 * 60 * 60 * 1000; // 6 h between sweeps
const FIRST_SWEEP_MS = 60 * 1000;    // first sweep ~1 min after boot

let started = false;

async function sweep(): Promise<void> {
  // Batch 4 rewires per-user sweeps (per-user config + hasQuoteKeys gate,
  // MAX_PER_SWEEP per user). Quotes are now per-account keys, not a single
  // instance-wide key, so this sweep can't run generically until it loads
  // each user's own AIConfig. Inert no-op until then.
  return;
}

export function startPriceScheduler(): void {
  if (started) return;
  started = true;
  setTimeout(() => void sweep(), FIRST_SWEEP_MS);
  setInterval(() => void sweep(), SWEEP_MS);
  console.log(`[price] scheduler started (refresh every ${refreshDays()} days, sweep every 6 h)`);
}
