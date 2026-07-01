import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { storageUnits, placements, cellarItems, wines } from "@/db/schema";

// All of a user's cubes, ordered for stable rendering.
export async function listUnits(userId: string) {
  return db
    .select()
    .from(storageUnits)
    .where(eq(storageUnits.userId, userId))
    .orderBy(storageUnits.gridY, storageUnits.gridX, storageUnits.createdAt);
}

// A single cube (scoped to the user), or null.
export async function getUnit(userId: string, unitId: string) {
  return (
    (await db
      .select()
      .from(storageUnits)
      .where(and(eq(storageUnits.id, unitId), eq(storageUnits.userId, userId)))
      .limit(1))[0] ?? null
  );
}

// Placements of one cellar item (scoped via the item's owner), oldest first so
// reconcile trims the most recent. Returns [{ id, unitId, compartment, quantity }].
export async function listPlacementsForItem(userId: string, cellarItemId: string) {
  return db
    .select({
      id: placements.id,
      unitId: placements.unitId,
      compartment: placements.compartment,
      quantity: placements.quantity,
    })
    .from(placements)
    .innerJoin(cellarItems, eq(placements.cellarItemId, cellarItems.id))
    .where(and(eq(placements.cellarItemId, cellarItemId), eq(cellarItems.userId, userId)))
    .orderBy(placements.createdAt);
}

// The "À ranger" tray: in-cellar items with unplaced bottles remaining.
export async function unplacedTray(userId: string) {
  const items = await db
    .select({
      itemId: cellarItems.id,
      quantity: cellarItems.quantity,
      wineId: wines.id,
      producer: wines.producer,
      cuvee: wines.cuvee,
      vintage: wines.vintage,
      color: wines.color,
    })
    .from(cellarItems)
    .innerJoin(wines, eq(cellarItems.wineId, wines.id))
    .where(and(eq(cellarItems.userId, userId), eq(cellarItems.status, "in_cellar")));

  const placed = await db
    .select({ cellarItemId: placements.cellarItemId, quantity: placements.quantity })
    .from(placements)
    .innerJoin(cellarItems, eq(placements.cellarItemId, cellarItems.id))
    .where(eq(cellarItems.userId, userId));

  const placedByItem = new Map<string, number>();
  for (const p of placed) placedByItem.set(p.cellarItemId, (placedByItem.get(p.cellarItemId) ?? 0) + p.quantity);

  return items
    .map((it) => ({ ...it, placed: placedByItem.get(it.itemId) ?? 0 }))
    .map((it) => ({ ...it, unplaced: Math.max(0, it.quantity - it.placed) }))
    .filter((it) => it.unplaced > 0);
}

// Every placement of the user's bottles, joined to the wine label — the raw rows
// the board groups by compartment. (Placements only exist for in-cellar bottles;
// drinking reconciles them away.)
export async function caveContents(userId: string) {
  return db
    .select({
      placementId: placements.id,
      unitId: placements.unitId,
      compartment: placements.compartment,
      quantity: placements.quantity,
      itemId: cellarItems.id,
      wineId: wines.id,
      producer: wines.producer,
      cuvee: wines.cuvee,
      vintage: wines.vintage,
      color: wines.color,
    })
    .from(placements)
    .innerJoin(cellarItems, eq(placements.cellarItemId, cellarItems.id))
    .innerJoin(wines, eq(cellarItems.wineId, wines.id))
    .where(eq(cellarItems.userId, userId));
}

// The compartments (unit + compartment) holding a given wine, for locate mode.
export async function locateWinePlacements(userId: string, wineId: string) {
  return db
    .select({ unitId: placements.unitId, compartment: placements.compartment })
    .from(placements)
    .innerJoin(cellarItems, eq(placements.cellarItemId, cellarItems.id))
    .where(and(eq(cellarItems.userId, userId), eq(cellarItems.wineId, wineId)));
}
