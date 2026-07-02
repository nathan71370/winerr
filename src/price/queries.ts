// src/price/queries.ts
import { desc, inArray, asc, eq, isNotNull, and } from "drizzle-orm";
import { db } from "@/db";
import { priceSnapshots } from "@/db/schema";

export type Snapshot = { wineId: string; estimate: number | null; low: number | null; high: number | null; fetchedAt: Date; source: string | null };

// Latest snapshot per wine (one query, newest-first, first-wins in app code —
// fine at personal-cellar scale).
export async function latestSnapshots(wineIds: string[]): Promise<Map<string, Snapshot>> {
  if (wineIds.length === 0) return new Map();
  const rows = await db
    .select({
      wineId: priceSnapshots.wineId,
      estimate: priceSnapshots.estimate,
      low: priceSnapshots.low,
      high: priceSnapshots.high,
      fetchedAt: priceSnapshots.fetchedAt,
      source: priceSnapshots.source,
    })
    .from(priceSnapshots)
    .where(inArray(priceSnapshots.wineId, wineIds))
    .orderBy(desc(priceSnapshots.fetchedAt));
  const map = new Map<string, Snapshot>();
  for (const r of rows) {
    if (map.has(r.wineId)) continue;
    map.set(r.wineId, {
      wineId: r.wineId,
      estimate: r.estimate != null ? Number(r.estimate) : null,
      low: r.low != null ? Number(r.low) : null,
      high: r.high != null ? Number(r.high) : null,
      fetchedAt: r.fetchedAt,
      source: r.source,
    });
  }
  return map;
}

// All non-empty estimates of a wine, oldest first — the sparkline series.
export async function priceHistory(wineId: string): Promise<{ estimate: number; fetchedAt: Date }[]> {
  const rows = await db
    .select({ estimate: priceSnapshots.estimate, fetchedAt: priceSnapshots.fetchedAt })
    .from(priceSnapshots)
    .where(and(eq(priceSnapshots.wineId, wineId), isNotNull(priceSnapshots.estimate)))
    .orderBy(asc(priceSnapshots.fetchedAt));
  return rows.map((r) => ({ estimate: Number(r.estimate), fetchedAt: r.fetchedAt }));
}
