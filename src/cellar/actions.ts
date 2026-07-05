"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { cellarItems, wines, priceSnapshots } from "@/db/schema";
import { requireUserId } from "@/auth/require-user";
import { addBottleSchema, updateBottleSchema } from "@/lib/validation";
import { ensureWine } from "@/catalog/service";
import { refreshDrinkWindow } from "@/catalog/drink-window";
import { refreshWinePrice, hasQuoteKeys } from "@/price/service";
import { reconcileItemPlacements } from "@/cave/actions";
import { todayLocalISO } from "@/lib/dates";
import { getUserAIConfig } from "@/settings/queries";

export async function addBottleAction(_prev: unknown, formData: FormData) {
  const userId = await requireUserId();
  const aiConfig = await getUserAIConfig(userId);
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
  // If the web enrichment found a drink window, set it on the wine (only when the
  // wine has none yet — don't clobber a shared catalog value). This makes the web
  // window the source and lets refreshDrinkWindow skip its own estimate.
  const dFrom = Number(formData.get("drinkFrom"));
  const dTo = Number(formData.get("drinkTo"));
  if (Number.isFinite(dFrom) && Number.isFinite(dTo) && dFrom > 0 && dTo > 0) {
    await db.update(wines)
      .set({ drinkFrom: dFrom, drinkTo: dTo, drinkWindowSource: "web", drinkWindowFetchedAt: new Date() })
      .where(and(eq(wines.id, wineId), isNull(wines.drinkFrom)));
  }
  const imageB64 = formData.get("imageB64");
  const imageMime = formData.get("imageMime");
  const imageUrl = formData.get("imageUrl");
  const { setWineImage } = await import("@/images/store");
  let imageStored = false;
  // Prefer a web product image when available (SSRF-hardened: https, no redirect, timeout).
  if (typeof imageUrl === "string" && imageUrl.length > 0) {
    try {
      const u = new URL(imageUrl);
      if (u.protocol === "https:") {
        const r = await fetch(imageUrl, { redirect: "error", signal: AbortSignal.timeout(8_000) });
        const ct = r.headers.get("content-type") ?? "";
        if (r.ok && ct.startsWith("image/")) {
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length > 0 && buf.length < 3_000_000) {
            await setWineImage(wineId, buf.toString("base64"), ct);
            imageStored = true;
          }
        }
      }
    } catch {
      // best-effort
    }
  }
  // Fallback to the user's uploaded photo.
  if (!imageStored &&
      typeof imageB64 === "string" && imageB64.length > 0 && imageB64.length < 4_000_000 &&
      typeof imageMime === "string" && imageMime.startsWith("image/")) {
    await setWineImage(wineId, imageB64, imageMime);
  }
  await db.insert(cellarItems).values({
    userId,
    wineId,
    quantity: d.quantity,
    purchasePrice: d.purchasePrice != null ? String(d.purchasePrice) : null,
    purchaseDate: todayLocalISO(),
  });
  // Fire-and-forget: estimate the drink window for this wine if not cached.
  // refreshDrinkWindow never throws; we intentionally don't await it so the
  // redirect isn't blocked. This relies on a long-lived Node process (Docker/
  // Komodo) keeping the async chain alive after the response — it is NOT
  // serverless-safe. If the process restarts mid-estimate, the window stays
  // null and is recomputed on the next add of the same wine (a 2C backfill
  // sweep is the proper home for stragglers).
  void refreshDrinkWindow(wineId, aiConfig);
  // Fire-and-forget (same caveat as above): seed a quote from the enrichment
  // result, THEN let refreshWinePrice's staleness gate skip the redundant
  // Tavily+Mistral search. Sequenced in one chain so the seed lands before the
  // gate reads it, without blocking the redirect. The seed insert is
  // unconditional (marketPriceEur came from enrichment, not a fresh lookup);
  // refreshWinePrice itself only runs when the user has quote-capable keys.
  void (async () => {
    try {
      if (d.marketPriceEur != null) {
        const existing = await db.select({ id: priceSnapshots.id }).from(priceSnapshots)
          .where(eq(priceSnapshots.wineId, wineId)).limit(1);
        if (existing.length === 0) {
          await db.insert(priceSnapshots).values({
            wineId,
            estimate: String(d.marketPriceEur),
            currency: "EUR",
            source: "web-enrich",
          });
        }
      }
    } catch (e) {
      console.error("[price] enrich seed failed", e);
    }
    if (hasQuoteKeys(aiConfig)) await refreshWinePrice(wineId, aiConfig);
  })();
  revalidatePath("/cellar");
  revalidatePath("/cave");
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

  await reconcileItemPlacements(userId, d.itemId);

  revalidatePath("/cellar");
  revalidatePath("/cave");
  revalidatePath(`/wine/${wineId}`);
  redirect(`/wine/${wineId}`);
}

export async function deleteBottleAction(formData: FormData) {
  const userId = await requireUserId();
  const itemId = String(formData.get("itemId"));
  await db.delete(cellarItems).where(and(eq(cellarItems.id, itemId), eq(cellarItems.userId, userId)));
  revalidatePath("/cellar");
  revalidatePath("/cave");
}

export async function markDrunkAction(formData: FormData) {
  const userId = await requireUserId();
  const itemId = String(formData.get("itemId"));
  // Decrement quantity; when it reaches 0, flip status to drunk. Single atomic
  // UPDATE — no window where quantity is 0 but status hasn't caught up yet.
  await db
    .update(cellarItems)
    .set({
      quantity: sql`greatest(${cellarItems.quantity} - 1, 0)`,
      status: sql`CASE WHEN ${cellarItems.quantity} - 1 <= 0 THEN 'drunk'::cellar_status ELSE ${cellarItems.status} END`,
    })
    .where(and(eq(cellarItems.id, itemId), eq(cellarItems.userId, userId)));
  await reconcileItemPlacements(userId, itemId);
  revalidatePath("/cellar");
  revalidatePath("/cave");
}
