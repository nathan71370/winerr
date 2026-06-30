"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { cellarItems } from "@/db/schema";
import { auth } from "@/auth/config";
import { addBottleSchema, updateBottleSchema } from "@/lib/validation";
import { ensureWine } from "@/catalog/service";
import { refreshDrinkWindow } from "@/catalog/drink-window";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return id;
}

export async function addBottleAction(_prev: unknown, formData: FormData) {
  const userId = await requireUserId();
  const parsed = addBottleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Champs invalides (le domaine et la couleur sont requis)." };
  }
  const d = parsed.data;
  const wineId = await ensureWine({
    producer: d.producer,
    cuvee: d.cuvee ?? null,
    vintage: d.vintage ?? null,
    region: d.region ?? null,
    country: d.country ?? null,
    color: d.color,
    grapes: d.grapes ?? null,
    lwinCode: d.lwinCode ?? null,
  });
  await db.insert(cellarItems).values({
    userId,
    wineId,
    quantity: d.quantity,
    purchasePrice: d.purchasePrice != null ? String(d.purchasePrice) : null,
    purchaseDate: new Date().toISOString().slice(0, 10), // today
  });
  // Fire-and-forget: estimate the drink window for this wine if not cached.
  // refreshDrinkWindow never throws; we intentionally don't await it so the
  // redirect isn't blocked. This relies on a long-lived Node process (Docker/
  // Komodo) keeping the async chain alive after the response — it is NOT
  // serverless-safe. If the process restarts mid-estimate, the window stays
  // null and is recomputed on the next add of the same wine (a 2C backfill
  // sweep is the proper home for stragglers).
  void refreshDrinkWindow(wineId);
  revalidatePath("/cellar");
  redirect("/cellar");
}

export async function updateBottleAction(_prev: unknown, formData: FormData) {
  const userId = await requireUserId();
  const parsed = updateBottleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Champs invalides (le domaine et la couleur sont requis)." };
  }
  const d = parsed.data;

  // Ownership check: the item must belong to the acting user.
  const existing = (await db
    .select({ id: cellarItems.id })
    .from(cellarItems)
    .where(and(eq(cellarItems.id, d.itemId), eq(cellarItems.userId, userId)))
    .limit(1))[0];
  if (!existing) return { error: "Bouteille introuvable." };

  // Re-resolve the catalog wine from the (possibly corrected) fields.
  const wineId = await ensureWine({
    producer: d.producer,
    cuvee: d.cuvee ?? null,
    vintage: d.vintage ?? null,
    region: d.region ?? null,
    country: d.country ?? null,
    color: d.color,
    grapes: d.grapes ?? null,
    lwinCode: d.lwinCode ?? null,
  });

  await db
    .update(cellarItems)
    .set({
      wineId,
      quantity: d.quantity,
      purchasePrice: d.purchasePrice != null ? String(d.purchasePrice) : null,
      ...(d.purchaseDate ? { purchaseDate: d.purchaseDate } : {}),
    })
    .where(and(eq(cellarItems.id, d.itemId), eq(cellarItems.userId, userId)));

  revalidatePath("/cellar");
  revalidatePath(`/wine/${wineId}`);
  redirect(`/wine/${wineId}`);
}

export async function deleteBottleAction(formData: FormData) {
  const userId = await requireUserId();
  const itemId = String(formData.get("itemId"));
  await db.delete(cellarItems).where(and(eq(cellarItems.id, itemId), eq(cellarItems.userId, userId)));
  revalidatePath("/cellar");
}

export async function markDrunkAction(formData: FormData) {
  const userId = await requireUserId();
  const itemId = String(formData.get("itemId"));
  // Decrement quantity; when it reaches 0, flip status to drunk.
  await db
    .update(cellarItems)
    .set({ quantity: sql`greatest(${cellarItems.quantity} - 1, 0)` })
    .where(and(eq(cellarItems.id, itemId), eq(cellarItems.userId, userId)));
  await db
    .update(cellarItems)
    .set({ status: "drunk" })
    .where(and(eq(cellarItems.id, itemId), eq(cellarItems.userId, userId), eq(cellarItems.quantity, 0)));
  revalidatePath("/cellar");
}
