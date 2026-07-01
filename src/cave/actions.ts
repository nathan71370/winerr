"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { storageUnits, placements, cellarItems } from "@/db/schema";
import { requireUserId } from "@/auth/require-user";
import { unitSchema, placeSchema, unplaceSchema } from "@/lib/validation";
import { isValidCompartment, type Unit } from "@/cave/compartments";
import { canPlace, reconcilePlacements } from "@/cave/placement";
import { getUnit, listPlacementsForItem } from "@/cave/queries";

export async function createUnitAction(_prev: unknown, formData: FormData) {
  const userId = await requireUserId();
  const parsed = unitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Champs du cube invalides." };
  const d = parsed.data;
  if (d.kind === "grid" && (!d.cols || !d.rows)) return { error: "Une grille exige des dimensions (colonnes × rangées)." };
  await db.insert(storageUnits).values({
    userId,
    name: d.name,
    kind: d.kind,
    cols: d.kind === "grid" ? d.cols ?? null : null,
    rows: d.kind === "grid" ? d.rows ?? null : null,
    gridX: d.gridX,
    gridY: d.gridY,
  });
  revalidatePath("/cave/setup");
  return { ok: true };
}

export async function updateUnitAction(_prev: unknown, formData: FormData) {
  const userId = await requireUserId();
  const unitId = String(formData.get("unitId") ?? "");
  const existing = await getUnit(userId, unitId);
  if (!existing) return { error: "Cube introuvable." };
  const parsed = unitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Champs du cube invalides." };
  const d = parsed.data;
  if (d.kind === "grid" && (!d.cols || !d.rows)) return { error: "Une grille exige des dimensions." };

  await db
    .update(storageUnits)
    .set({
      name: d.name,
      kind: d.kind,
      cols: d.kind === "grid" ? d.cols ?? null : null,
      rows: d.kind === "grid" ? d.rows ?? null : null,
      gridX: d.gridX,
      gridY: d.gridY,
    })
    .where(and(eq(storageUnits.id, unitId), eq(storageUnits.userId, userId)));

  // Drop placements that now point at a compartment the resized/retyped cube no
  // longer has (shrunk grid, or grid→diamond). Freed bottles return to the tray.
  const updated = await getUnit(userId, unitId);
  if (updated) {
    const rows = await db
      .select({ id: placements.id, compartment: placements.compartment })
      .from(placements)
      .where(eq(placements.unitId, unitId));
    const asUnit: Unit = { kind: updated.kind, cols: updated.cols, rows: updated.rows };
    for (const r of rows) {
      if (!isValidCompartment(asUnit, r.compartment)) {
        await db.delete(placements).where(eq(placements.id, r.id));
      }
    }
  }
  revalidatePath("/cave/setup");
  return { ok: true };
}

export async function deleteUnitAction(formData: FormData) {
  const userId = await requireUserId();
  const unitId = String(formData.get("unitId") ?? "");
  // Placements cascade-delete (FK), so bottles return to the tray, never lost.
  await db.delete(storageUnits).where(and(eq(storageUnits.id, unitId), eq(storageUnits.userId, userId)));
  revalidatePath("/cave/setup");
}

// Plain form action (used directly in <form action={placeBottlesAction}>), so
// its only argument is FormData. Invalid/guard-failed requests are a silent
// no-op (the max={unplaced} input + server guard keep the invariant).
export async function placeBottlesAction(formData: FormData) {
  const userId = await requireUserId();
  const parsed = placeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const d = parsed.data;

  const item = (await db
    .select({ id: cellarItems.id, quantity: cellarItems.quantity })
    .from(cellarItems)
    .where(and(eq(cellarItems.id, d.cellarItemId), eq(cellarItems.userId, userId)))
    .limit(1))[0];
  if (!item) return;

  const unit = await getUnit(userId, d.unitId);
  if (!unit) return;
  if (!isValidCompartment({ kind: unit.kind, cols: unit.cols, rows: unit.rows }, d.compartment)) return;

  const current = await listPlacementsForItem(userId, d.cellarItemId);
  if (!canPlace(item.quantity, current, d.quantity)) return;

  const same = current.find((p) => p.unitId === d.unitId && p.compartment === d.compartment);
  if (same) {
    await db.update(placements).set({ quantity: same.quantity + d.quantity }).where(eq(placements.id, same.id));
  } else {
    await db.insert(placements).values({
      cellarItemId: d.cellarItemId,
      unitId: d.unitId,
      compartment: d.compartment,
      quantity: d.quantity,
    });
  }
  revalidatePath("/cave/setup");
  revalidatePath("/cave");
}

export async function unplaceAction(formData: FormData) {
  const userId = await requireUserId();
  const parsed = unplaceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const d = parsed.data;

  const row = (await db
    .select({ id: placements.id, quantity: placements.quantity })
    .from(placements)
    .innerJoin(cellarItems, eq(placements.cellarItemId, cellarItems.id))
    .where(and(eq(placements.id, d.placementId), eq(cellarItems.userId, userId)))
    .limit(1))[0];
  if (!row) return;

  const remove = d.quantity ?? row.quantity;
  if (remove >= row.quantity) {
    await db.delete(placements).where(eq(placements.id, row.id));
  } else {
    await db.update(placements).set({ quantity: row.quantity - remove }).where(eq(placements.id, row.id));
  }
  revalidatePath("/cave/setup");
  revalidatePath("/cave");
}

// Restore the invariant Σ placements ≤ item.quantity after the item quantity
// changes (drink, edit-down). Trims the most recent placements; deletes any
// reduced to zero. Call AFTER the cellar_items quantity has been written.
export async function reconcileItemPlacements(userId: string, cellarItemId: string): Promise<void> {
  const item = (await db
    .select({ quantity: cellarItems.quantity })
    .from(cellarItems)
    .where(and(eq(cellarItems.id, cellarItemId), eq(cellarItems.userId, userId)))
    .limit(1))[0];
  if (!item) return;
  const current = await listPlacementsForItem(userId, cellarItemId);
  const reconciled = reconcilePlacements(current, item.quantity);
  for (let i = 0; i < reconciled.length; i++) {
    const before = current[i];
    const after = reconciled[i];
    if (after.quantity === before.quantity) continue;
    if (after.quantity <= 0) {
      await db.delete(placements).where(eq(placements.id, before.id));
    } else {
      await db.update(placements).set({ quantity: after.quantity }).where(eq(placements.id, before.id));
    }
  }
}
