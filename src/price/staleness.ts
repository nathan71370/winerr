// src/price/staleness.ts
// Pure: does a wine's quote need refreshing? A snapshot older than refreshDays
// (or no snapshot at all) is stale. Failed lookups also produce a snapshot, so
// a failure isn't retried before the next window.
export function needsRefresh(latestFetchedAt: Date | null, now: Date, refreshDays: number): boolean {
  if (!latestFetchedAt) return true;
  return now.getTime() - latestFetchedAt.getTime() > refreshDays * 24 * 60 * 60 * 1000;
}
