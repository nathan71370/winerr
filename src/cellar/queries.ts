import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { cellarItems, wines, lwinWines } from "@/db/schema";

// The user's bottles (default: in cellar), joined to their wine.
export async function listCellar(userId: string) {
  return db
    .select({
      itemId: cellarItems.id,
      quantity: cellarItems.quantity,
      purchasePrice: cellarItems.purchasePrice,
      purchaseDate: cellarItems.purchaseDate,
      status: cellarItems.status,
      wineId: wines.id,
      producer: wines.producer,
      cuvee: wines.cuvee,
      vintage: wines.vintage,
      region: wines.region,
      color: wines.color,
      drinkFrom: wines.drinkFrom,
      drinkTo: wines.drinkTo,
    })
    .from(cellarItems)
    .innerJoin(wines, eq(cellarItems.wineId, wines.id))
    .where(and(eq(cellarItems.userId, userId), eq(cellarItems.status, "in_cellar")))
    .orderBy(desc(cellarItems.createdAt));
}

// Name-search over the LWIN reference (autocomplete for the add form).
export async function searchWines(query: string, limit = 10) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  // Escape LIKE metacharacters (\ % _) so user input can't act as a wildcard,
  // and cap length to avoid pathological patterns.
  const escaped = trimmed.slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`);
  const q = `%${escaped}%`;
  return db
    .select({
      lwin: lwinWines.lwin,
      displayName: lwinWines.displayName,
      producer: lwinWines.producer,
      wine: lwinWines.wine,
      region: lwinWines.region,
      country: lwinWines.country,
      colour: lwinWines.colour,
    })
    .from(lwinWines)
    .where(or(ilike(lwinWines.displayName, q), ilike(lwinWines.producer, q)))
    .limit(limit);
}

export async function getWineWithBottles(userId: string, wineId: string) {
  const wine = (await db.select().from(wines).where(eq(wines.id, wineId)).limit(1))[0];
  if (!wine) return null;
  const bottles = await db
    .select()
    .from(cellarItems)
    .where(and(eq(cellarItems.userId, userId), eq(cellarItems.wineId, wineId)));
  return { wine, bottles };
}
