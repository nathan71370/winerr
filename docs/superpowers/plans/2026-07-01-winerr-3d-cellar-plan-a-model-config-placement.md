# 3D Cellar — Plan A: Model + Configurator + Placement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every bottle a real, per-compartment address in the user's cellar — a cube configurator plus placement into grid/diamond compartments — with correct invariants, before any visual layer.

**Architecture:** Two new tables (`storage_units`, `placements`). Pure, unit-tested modules for compartment enumeration/validation and placement arithmetic (unplaced count, over-placement guard, reconcile-on-shrink). Server actions for unit CRUD and place/unplace, all user-scoped. A light configurator page and a "Ranger dans…" field on the bottle edit form. No isometric view yet (Plan B).

**Tech Stack:** Next.js 16 (App Router, server actions), Drizzle ORM + Postgres, Zod 4, Vitest. `@` → `src`. Marathon CSS-var tokens.

**Reference:** spec at `docs/superpowers/specs/2026-07-01-winerr-3d-cellar-design.md`.

---

## File structure (Plan A)

- Create `src/cave/compartments.ts` — pure: `compartmentKeys`, `isValidCompartment`.
- Create `src/cave/placement.ts` — pure: `placedTotal`, `unplacedQuantity`, `canPlace`, `reconcilePlacements`.
- Create `src/cave/queries.ts` — DB reads: units + placements + unplaced tray.
- Create `src/cave/actions.ts` — server actions: unit CRUD, place/unplace, `reconcileItemPlacements`.
- Create `src/auth/require-user.ts` — shared `requireUserId()` (used by new actions).
- Create `src/app/cave/setup/page.tsx` — configurator page.
- Create `src/app/cave/setup/UnitForm.tsx` — client add/edit cube form.
- Modify `src/db/schema.ts` — enum `storage_kind` + `storageUnits` + `placements`.
- Modify `src/lib/validation.ts` — `unitSchema`, `placeSchema`, `unplaceSchema`.
- Modify `src/cellar/actions.ts` — reconcile placements in `markDrunkAction` / `updateBottleAction`.
- Modify `src/app/cellar/[itemId]/edit/EditBottleForm.tsx` + `page.tsx` — "Ranger dans…" control.
- Modify `src/app/cellar/page.tsx` — header link to `/cave/setup`.
- Tests: `tests/cave-compartments.test.ts`, `tests/cave-placement.test.ts`, `tests/cave-validation.test.ts`.

---

## Task 1: Database schema — units + placements

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0004_*.sql` (generated)

- [ ] **Step 1: Add the enum, tables, and imports to the schema**

At the top of `src/db/schema.ts`, the import already includes `pgEnum, uuid, text, integer, timestamp, unique`. Add `index` to the `drizzle-orm/pg-core` import list so it reads:

```ts
import { pgTable, uuid, text, integer, timestamp, numeric, pgEnum, date, unique, index } from "drizzle-orm/pg-core";
```

Add this enum next to the existing enums (after `cellarStatus`):

```ts
export const storageKind = pgEnum("storage_kind", ["grid", "diamond"]);
```

Append these two tables at the end of the file:

```ts
export const storageUnits = pgTable("storage_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: storageKind("kind").notNull(),
  cols: integer("cols"),
  rows: integer("rows"),
  gridX: integer("grid_x").notNull().default(0),
  gridY: integer("grid_y").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const placements = pgTable("placements", {
  id: uuid("id").primaryKey().defaultRandom(),
  cellarItemId: uuid("cellar_item_id").notNull().references(() => cellarItems.id, { onDelete: "cascade" }),
  unitId: uuid("unit_id").notNull().references(() => storageUnits.id, { onDelete: "cascade" }),
  compartment: text("compartment").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  byItem: index("placements_item_idx").on(t.cellarItemId),
  byUnit: index("placements_unit_idx").on(t.unitId),
}));
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `drizzle/0004_*.sql` file is created containing `CREATE TYPE "public"."storage_kind"`, `CREATE TABLE "storage_units"`, `CREATE TABLE "placements"`, and the two indexes. No errors.

- [ ] **Step 3: Type-check compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors from `schema.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(cave): storage_units + placements schema and migration 0004"
```

---

## Task 2: Pure compartment logic

**Files:**
- Create: `src/cave/compartments.ts`
- Test: `tests/cave-compartments.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { compartmentKeys, isValidCompartment, type Unit } from "@/cave/compartments";

const diamond: Unit = { kind: "diamond", cols: null, rows: null };
const grid: Unit = { kind: "grid", cols: 3, rows: 2 };

describe("compartmentKeys", () => {
  it("returns the four fixed compartments for a diamond", () => {
    expect(compartmentKeys(diamond)).toEqual(["N", "E", "S", "O"]);
  });
  it("returns row-major L{r}C{c} keys for a grid", () => {
    expect(compartmentKeys(grid)).toEqual(["L1C1", "L1C2", "L1C3", "L2C1", "L2C2", "L2C3"]);
  });
  it("returns no keys for a grid with missing dimensions", () => {
    expect(compartmentKeys({ kind: "grid", cols: null, rows: null })).toEqual([]);
  });
});

describe("isValidCompartment", () => {
  it("accepts a legal key and rejects an illegal one", () => {
    expect(isValidCompartment(diamond, "N")).toBe(true);
    expect(isValidCompartment(diamond, "L1C1")).toBe(false);
    expect(isValidCompartment(grid, "L2C3")).toBe(true);
    expect(isValidCompartment(grid, "L3C1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/cave-compartments.test.ts`
Expected: FAIL — cannot resolve `@/cave/compartments`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/cave/compartments.ts
// A cube is either a "grid" (individual slots, cols × rows) or a "diamond"
// (an X divider → four bulk compartments N/E/S/O). Compartments are derived,
// never stored: a compartment is identified by a key valid for the unit's kind.
export type Unit = {
  kind: "grid" | "diamond";
  cols: number | null;
  rows: number | null;
};

const DIAMOND_KEYS = ["N", "E", "S", "O"] as const;

export function compartmentKeys(unit: Unit): string[] {
  if (unit.kind === "diamond") return [...DIAMOND_KEYS];
  const cols = unit.cols ?? 0;
  const rows = unit.rows ?? 0;
  const keys: string[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) keys.push(`L${r}C${c}`);
  }
  return keys;
}

export function isValidCompartment(unit: Unit, key: string): boolean {
  return compartmentKeys(unit).includes(key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/cave-compartments.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/cave/compartments.ts tests/cave-compartments.test.ts
git commit -m "feat(cave): pure compartment enumeration + validation"
```

---

## Task 3: Pure placement arithmetic

**Files:**
- Create: `src/cave/placement.ts`
- Test: `tests/cave-placement.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { placedTotal, unplacedQuantity, canPlace, reconcilePlacements } from "@/cave/placement";

describe("placedTotal / unplacedQuantity", () => {
  it("sums placement quantities", () => {
    expect(placedTotal([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
    expect(placedTotal([])).toBe(0);
  });
  it("computes the unplaced remainder, never negative", () => {
    expect(unplacedQuantity(6, [{ quantity: 2 }, { quantity: 1 }])).toBe(3);
    expect(unplacedQuantity(2, [{ quantity: 5 }])).toBe(0);
  });
});

describe("canPlace", () => {
  it("allows placing within the unplaced remainder", () => {
    expect(canPlace(6, [{ quantity: 2 }], 4)).toBe(true);
    expect(canPlace(6, [{ quantity: 2 }], 5)).toBe(false); // would exceed 6
  });
  it("rejects non-positive quantities", () => {
    expect(canPlace(6, [], 0)).toBe(false);
    expect(canPlace(6, [], -1)).toBe(false);
  });
});

describe("reconcilePlacements", () => {
  it("leaves placements untouched when within max", () => {
    expect(reconcilePlacements([{ id: "a", quantity: 2 }], 3)).toEqual([{ id: "a", quantity: 2 }]);
  });
  it("trims excess from the most recent placements first", () => {
    expect(reconcilePlacements([{ id: "a", quantity: 2 }, { id: "b", quantity: 2 }], 3))
      .toEqual([{ id: "a", quantity: 2 }, { id: "b", quantity: 1 }]);
  });
  it("zeroes everything when max is 0", () => {
    expect(reconcilePlacements([{ id: "a", quantity: 2 }, { id: "b", quantity: 1 }], 0))
      .toEqual([{ id: "a", quantity: 0 }, { id: "b", quantity: 0 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/cave-placement.test.ts`
Expected: FAIL — cannot resolve `@/cave/placement`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/cave/placement.ts
// Invariant: Σ placements.quantity ≤ cellar_items.quantity. The unplaced count
// is the remainder. reconcilePlacements restores the invariant after a quantity
// drop (drink, edit-down, etc.) by trimming from the most-recent placement first.
export function placedTotal(placements: { quantity: number }[]): number {
  return placements.reduce((sum, p) => sum + p.quantity, 0);
}

export function unplacedQuantity(itemQuantity: number, placements: { quantity: number }[]): number {
  return Math.max(0, itemQuantity - placedTotal(placements));
}

export function canPlace(itemQuantity: number, placements: { quantity: number }[], addQty: number): boolean {
  if (addQty < 1) return false;
  return placedTotal(placements) + addQty <= itemQuantity;
}

// Returns the placements with quantities trimmed so their total ≤ maxTotal.
// Trims from the end (most-recently-added first). Entries left at 0 should be
// deleted by the caller.
export function reconcilePlacements<T extends { quantity: number }>(placements: T[], maxTotal: number): T[] {
  const cap = Math.max(0, maxTotal);
  let excess = Math.max(0, placedTotal(placements) - cap);
  const result = placements.map((p) => ({ ...p }));
  for (let i = result.length - 1; i >= 0 && excess > 0; i--) {
    const take = Math.min(result[i].quantity, excess);
    result[i].quantity -= take;
    excess -= take;
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/cave-placement.test.ts`
Expected: PASS (7 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/cave/placement.ts tests/cave-placement.test.ts
git commit -m "feat(cave): pure placement arithmetic (unplaced, guard, reconcile)"
```

---

## Task 4: Validation schemas

**Files:**
- Modify: `src/lib/validation.ts`
- Test: `tests/cave-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { unitSchema, placeSchema, unplaceSchema } from "@/lib/validation";

describe("unitSchema", () => {
  it("accepts a diamond with no dimensions", () => {
    const r = unitSchema.safeParse({ name: "Cube B", kind: "diamond", gridX: "1", gridY: "0" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.cols).toBeUndefined();
  });
  it("coerces grid dimensions and position to ints", () => {
    const r = unitSchema.safeParse({ name: "Cube A", kind: "grid", cols: "4", rows: "4", gridX: "0", gridY: "1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ cols: 4, rows: 4, gridX: 0, gridY: 1 });
  });
  it("rejects an unknown kind and an empty name", () => {
    expect(unitSchema.safeParse({ name: "", kind: "grid", gridX: "0", gridY: "0" }).success).toBe(false);
    expect(unitSchema.safeParse({ name: "X", kind: "barrel", gridX: "0", gridY: "0" }).success).toBe(false);
  });
});

describe("placeSchema", () => {
  it("parses a placement with a positive quantity", () => {
    const r = placeSchema.safeParse({ cellarItemId: "i1", unitId: "u1", compartment: "N", quantity: "2" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quantity).toBe(2);
  });
  it("rejects a non-positive quantity", () => {
    expect(placeSchema.safeParse({ cellarItemId: "i1", unitId: "u1", compartment: "N", quantity: "0" }).success).toBe(false);
  });
});

describe("unplaceSchema", () => {
  it("requires a placement id", () => {
    expect(unplaceSchema.safeParse({ placementId: "p1" }).success).toBe(true);
    expect(unplaceSchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/cave-validation.test.ts`
Expected: FAIL — `unitSchema` is not exported.

- [ ] **Step 3: Add the schemas**

Append to `src/lib/validation.ts` (the `emptyToUndefined` helper already exists at the top of the file):

```ts
export const unitSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["grid", "diamond"]),
  cols: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(20).optional()),
  rows: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(20).optional()),
  gridX: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(0)),
  gridY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(0)),
});
export type UnitInput = z.infer<typeof unitSchema>;

export const placeSchema = z.object({
  cellarItemId: z.string().min(1),
  unitId: z.string().min(1),
  compartment: z.string().min(1),
  quantity: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1)),
});
export type PlaceInput = z.infer<typeof placeSchema>;

export const unplaceSchema = z.object({
  placementId: z.string().min(1),
  quantity: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional()),
});
export type UnplaceInput = z.infer<typeof unplaceSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/cave-validation.test.ts`
Expected: PASS (7 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts tests/cave-validation.test.ts
git commit -m "feat(cave): zod schemas for unit + place + unplace"
```

---

## Task 5: Shared requireUserId helper

**Files:**
- Create: `src/auth/require-user.ts`

- [ ] **Step 1: Create the helper**

```ts
// src/auth/require-user.ts
import { redirect } from "next/navigation";
import { auth } from "@/auth/config";

// Returns the acting user's id, or redirects to /login. Use in every server
// action / query that must be scoped to the current user.
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return id;
}
```

- [ ] **Step 2: Type-check compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/auth/require-user.ts
git commit -m "feat(auth): shared requireUserId helper"
```

---

## Task 6: Cave queries

**Files:**
- Create: `src/cave/queries.ts`

> DB read helpers — no unit test (matches the untested `src/cellar/queries.ts` convention; the pure logic is already covered).

- [ ] **Step 1: Create the queries**

```ts
// src/cave/queries.ts
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
// Returns each item with its wine label + total quantity + placed total; the
// caller computes unplaced = quantity − placed.
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
```

- [ ] **Step 2: Type-check compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/cave/queries.ts
git commit -m "feat(cave): unit + placement + unplaced-tray queries"
```

---

## Task 7: Cave actions (unit CRUD + place/unplace + reconcile helper)

**Files:**
- Create: `src/cave/actions.ts`

- [ ] **Step 1: Create the actions**

```ts
// src/cave/actions.ts
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

  // Drop any placements that now point at a compartment the resized/retyped
  // cube no longer has (e.g. a shrunk grid, or grid→diamond). Freed bottles
  // return to the tray automatically.
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
// no-op (the max={unplaced} input + server guard keep the invariant); richer
// error surfacing arrives with Plan B's in-view placement UI.
export async function placeBottlesAction(formData: FormData) {
  const userId = await requireUserId();
  const parsed = placeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const d = parsed.data;

  // Ownership: the item must belong to the user.
  const item = (await db
    .select({ id: cellarItems.id, quantity: cellarItems.quantity })
    .from(cellarItems)
    .where(and(eq(cellarItems.id, d.cellarItemId), eq(cellarItems.userId, userId)))
    .limit(1))[0];
  if (!item) return;

  // The compartment must be legal for the target cube (owned by the user).
  const unit = await getUnit(userId, d.unitId);
  if (!unit) return;
  if (!isValidCompartment({ kind: unit.kind, cols: unit.cols, rows: unit.rows }, d.compartment)) return;

  // Over-placement guard against the current placed total.
  const current = await listPlacementsForItem(userId, d.cellarItemId);
  if (!canPlace(item.quantity, current, d.quantity)) return;

  // Merge into an existing placement in the same compartment, else insert.
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

  // Ownership via the placement → item → user chain.
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
```

- [ ] **Step 2: Type-check compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/cave/actions.ts
git commit -m "feat(cave): unit CRUD, place/unplace, reconcile actions"
```

---

## Task 8: Reconcile placements on drink / edit-down

**Files:**
- Modify: `src/cellar/actions.ts`

- [ ] **Step 1: Import the reconcile helper**

`src/cellar/actions.ts` already defines its own local `requireUserId` — leave it. Add just one import at the top of the file:

```ts
import { reconcileItemPlacements } from "@/cave/actions";
```

- [ ] **Step 2: Reconcile after decrementing in `markDrunkAction`**

In `markDrunkAction`, after the two existing `db.update` calls and before `revalidatePath("/cellar")`, add:

```ts
  await reconcileItemPlacements(userId, itemId);
```

The full tail of `markDrunkAction` becomes:

```ts
  await db
    .update(cellarItems)
    .set({ status: "drunk" })
    .where(and(eq(cellarItems.id, itemId), eq(cellarItems.userId, userId), eq(cellarItems.quantity, 0)));
  await reconcileItemPlacements(userId, itemId);
  revalidatePath("/cellar");
```

- [ ] **Step 3: Reconcile after `updateBottleAction` writes a new quantity**

In `updateBottleAction`, after the `db.update(cellarItems).set({...})` call and before `revalidatePath("/cellar")`, add:

```ts
  await reconcileItemPlacements(userId, d.itemId);
```

- [ ] **Step 4: Type-check + run the full suite**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: compiles; all existing tests plus the three new cave test files pass.

- [ ] **Step 5: Commit**

```bash
git add src/cellar/actions.ts
git commit -m "feat(cave): trim placements when a bottle is drunk or quantity lowered"
```

---

## Task 9: Configurator page + form

**Files:**
- Create: `src/app/cave/setup/UnitForm.tsx`
- Create: `src/app/cave/setup/page.tsx`

- [ ] **Step 1: Create the client form**

```tsx
// src/app/cave/setup/UnitForm.tsx
"use client";

import { useActionState, useState } from "react";
import { createUnitAction, updateUnitAction } from "@/cave/actions";

type UnitRow = { id: string; name: string; kind: "grid" | "diamond"; cols: number | null; rows: number | null; gridX: number; gridY: number };

export function UnitForm({ unit }: { unit?: UnitRow }) {
  const action = unit ? updateUnitAction : createUnitAction;
  const [state, formAction] = useActionState(action, null as { error?: string; ok?: boolean } | null);
  const [kind, setKind] = useState<"grid" | "diamond">(unit?.kind ?? "grid");

  return (
    <form action={formAction} style={{ display: "grid", gap: "var(--s-3)", padding: "var(--s-4)", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
      {unit && <input type="hidden" name="unitId" value={unit.id} />}
      <input name="name" defaultValue={unit?.name ?? ""} placeholder="Nom du cube" required style={inp} />
      <div style={{ display: "flex", gap: "var(--s-2)" }}>
        <label style={{ flex: 1 }}>
          <input type="radio" name="kind" value="grid" checked={kind === "grid"} onChange={() => setKind("grid")} /> Grille
        </label>
        <label style={{ flex: 1 }}>
          <input type="radio" name="kind" value="diamond" checked={kind === "diamond"} onChange={() => setKind("diamond")} /> Losange
        </label>
      </div>
      {kind === "grid" && (
        <div style={{ display: "flex", gap: "var(--s-2)" }}>
          <input name="cols" type="number" min={1} max={20} defaultValue={unit?.cols ?? 4} placeholder="colonnes" style={inp} />
          <input name="rows" type="number" min={1} max={20} defaultValue={unit?.rows ?? 4} placeholder="rangées" style={inp} />
        </div>
      )}
      <div style={{ display: "flex", gap: "var(--s-2)" }}>
        <input name="gridX" type="number" min={0} defaultValue={unit?.gridX ?? 0} placeholder="colonne" style={inp} />
        <input name="gridY" type="number" min={0} defaultValue={unit?.gridY ?? 0} placeholder="niveau" style={inp} />
      </div>
      {state?.error && <p style={{ color: "var(--warn)", fontSize: "var(--t-small)" }}>{state.error}</p>}
      <button style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "var(--s-2) var(--s-4)", cursor: "pointer" }}>
        {unit ? "Enregistrer" : "+ Ajouter le cube"}
      </button>
    </form>
  );
}

const inp: React.CSSProperties = { padding: "var(--s-2) var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)", width: "100%" };
```

- [ ] **Step 2: Create the page**

```tsx
// src/app/cave/setup/page.tsx
import { requireUserId } from "@/auth/require-user";
import { listUnits } from "@/cave/queries";
import { deleteUnitAction } from "@/cave/actions";
import { UnitForm } from "./UnitForm";

export default async function CaveSetupPage() {
  const userId = await requireUserId();
  const units = await listUnits(userId);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>Configurer ma cave</h1>
        <a href="/cellar" style={{ fontSize: "var(--t-small)" }}>← Ma cave</a>
      </header>

      <section style={{ marginTop: "var(--s-5)" }}>
        <h2 style={{ fontSize: "var(--t-h3)", color: "var(--ink-soft)" }}>Mes cubes</h2>
        {units.length === 0 ? (
          <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginTop: "var(--s-3)" }}>Aucun cube. Ajoute-en un ci-dessous.</p>
        ) : (
          <ul style={{ listStyle: "none", display: "grid", gap: "var(--s-3)", marginTop: "var(--s-3)" }}>
            {units.map((u) => (
              <li key={u.id} style={{ display: "grid", gap: "var(--s-3)", padding: "var(--s-4)", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <b style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h3)" }}>{u.name}</b>
                  <span style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)" }}>
                    {u.kind === "grid" ? `Grille ${u.cols}×${u.rows}` : "Losange · 4 comp."} · pos {u.gridX}·{u.gridY}
                  </span>
                </div>
                <UnitForm unit={u} />
                <form action={deleteUnitAction}>
                  <input type="hidden" name="unitId" value={u.id} />
                  <button style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "var(--s-1) var(--s-3)", fontSize: "var(--t-meta)", color: "var(--warn)", cursor: "pointer" }}>
                    Supprimer ce cube (les bouteilles reviennent « à ranger »)
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "var(--s-6)" }}>
        <h2 style={{ fontSize: "var(--t-h3)", color: "var(--ink-soft)", marginBottom: "var(--s-3)" }}>Ajouter un cube</h2>
        <UnitForm />
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Type-check compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/cave/setup/
git commit -m "feat(cave): configurator page + add/edit cube form"
```

---

## Task 10: "Ranger dans…" field on the edit bottle form

**Files:**
- Modify: `src/app/cellar/[itemId]/edit/page.tsx`
- Modify: `src/app/cellar/[itemId]/edit/EditBottleForm.tsx`

> Placement is offered on the EDIT page (the item already exists there). Add-time placement is intentionally deferred — a freshly added bottle is placed from its edit page or, in Plan B, the cave view.

- [ ] **Step 1: Read the current edit page + form**

Run: `sed -n '1,60p' src/app/cellar/\[itemId\]/edit/page.tsx` and the same for `EditBottleForm.tsx` to see how props flow. The page loads the item via `getCellarItem(userId, itemId)` and renders `<EditBottleForm ... />`.

- [ ] **Step 2: Pass units + current placements + unplaced count into the page's data load**

In `src/app/cellar/[itemId]/edit/page.tsx`, add imports:

```ts
import { listUnits, listPlacementsForItem } from "@/cave/queries";
import { compartmentKeys } from "@/cave/compartments";
import { placeBottlesAction, unplaceAction } from "@/cave/actions";
import { unplacedQuantity } from "@/cave/placement";
```

After the existing item load, add:

```ts
  const units = await listUnits(userId);
  const itemPlacements = await listPlacementsForItem(userId, itemId);
  const unitOptions = units.map((u) => ({ id: u.id, name: u.name, compartments: compartmentKeys({ kind: u.kind, cols: u.cols, rows: u.rows }) }));
  const unplaced = unplacedQuantity(item.quantity, itemPlacements);
```

Then render a placement block below the existing `<EditBottleForm .../>` (still inside the page's returned JSX, before the closing `</main>`):

```tsx
      <section style={{ marginTop: "var(--s-6)" }}>
        <h2 style={{ fontSize: "var(--t-h3)", color: "var(--ink-soft)" }}>Rangement</h2>
        <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginTop: "var(--s-1)" }}>{unplaced} bouteille(s) non rangée(s).</p>

        {itemPlacements.length > 0 && (
          <ul style={{ listStyle: "none", display: "grid", gap: "var(--s-2)", marginTop: "var(--s-3)" }}>
            {itemPlacements.map((p) => {
              const unit = units.find((u) => u.id === p.unitId);
              return (
                <li key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--s-2) var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)" }}>
                  <span style={{ fontSize: "var(--t-small)" }}>{unit?.name ?? "?"} · {p.compartment} · ×{p.quantity}</span>
                  <form action={unplaceAction}>
                    <input type="hidden" name="placementId" value={p.id} />
                    <button style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "2px 10px", fontSize: "var(--t-meta)", color: "var(--warn)", cursor: "pointer" }}>Retirer</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        {unplaced > 0 && unitOptions.length > 0 && (
          <form action={placeBottlesAction} style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)", marginTop: "var(--s-3)", alignItems: "center" }}>
            <input type="hidden" name="cellarItemId" value={item.itemId} />
            <select name="unitId" required style={sel} id="place-unit">
              {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select name="compartment" required style={sel}>
              {unitOptions[0].compartments.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input name="quantity" type="number" min={1} max={unplaced} defaultValue={1} style={{ ...sel, width: 64 }} />
            <button style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "var(--s-2) var(--s-4)", cursor: "pointer", fontSize: "var(--t-small)" }}>Ranger</button>
          </form>
        )}
        {unitOptions.length === 0 && (
          <p style={{ fontSize: "var(--t-small)", marginTop: "var(--s-3)" }}><a href="/cave/setup">Configure d’abord ta cave</a> pour ranger cette bouteille.</p>
        )}
      </section>
```

Add the shared `sel` style constant near the bottom of the page file (or reuse an existing one if present):

```ts
const sel: React.CSSProperties = { padding: "var(--s-2) var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)" };
```

> The compartment `<select>` initially lists the FIRST unit's compartments. Cross-unit compartment refresh (changing the unit re-populates compartments) is a small client enhancement deferred to Plan B's richer placement UI; a wrong-unit/compartment combo is already rejected server-side by `isValidCompartment`.

- [ ] **Step 3: Type-check compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. If `item.itemId` vs `item.id` mismatches, use whichever `getCellarItem` returns (it returns `itemId`).

- [ ] **Step 4: Commit**

```bash
git add "src/app/cellar/[itemId]/edit/"
git commit -m "feat(cave): place/unplace a bottle from its edit page"
```

---

## Task 11: Link the configurator from the cellar header

**Files:**
- Modify: `src/app/cellar/page.tsx:33-34`

- [ ] **Step 1: Add the "Ma cave (3D)" link**

In the header actions `<div>` (currently holding "+ Ajouter" and "Déconnexion"), add a link before "+ Ajouter":

```tsx
          <a href="/cave/setup" style={{ fontSize: "var(--t-small)" }}>Ma cave (3D)</a>
          <a href="/cellar/add" style={{ fontSize: "var(--t-small)" }}>+ Ajouter</a>
```

- [ ] **Step 2: Type-check compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/cellar/page.tsx
git commit -m "feat(cave): link the cellar configurator from the cellar header"
```

---

## Task 12: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: all tests pass, including `cave-compartments`, `cave-placement`, `cave-validation` (existing count 65 + new).

- [ ] **Step 2: Type-check + lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Production build (webpack, matches deploy)**

Run: `pnpm build`
Expected: build succeeds (the app uses `next build --webpack`). `/cave/setup` appears in the route list.

- [ ] **Step 4: Manual smoke (requires a running DB)**

With the dev DB up and migration 0004 applied (boot migration or `pnpm db:migrate`):
1. Log in → cellar → "Ma cave (3D)" → add a grid cube 4×4 and a diamond cube.
2. Edit a bottle (quantity ≥ 2) → "Rangement" → place 1 in the grid, 1 in the diamond → unplaced count drops.
3. "Bue −1" on that bottle in the cellar list → a placement is trimmed (reconcile).
4. Delete a cube in the configurator → its bottles return to "non rangées".

- [ ] **Step 5: Final commit (if any smoke fixes)**

```bash
git add -A && git commit -m "test(cave): Plan A verification fixes" || echo "nothing to commit"
```

---

## Done when

- `storage_units` + `placements` exist (migration 0004) and the invariant Σ placements ≤ item quantity holds across place, unplace, drink, edit-down, and cube edit/delete.
- A user can configure cubes and place/unplace bottles into compartments from the edit page.
- All pure logic is unit-tested; `pnpm test`, `tsc`, `lint`, and `build` are green.
- **Next:** Plan B — the isometric cave view (`/cave`), the "À ranger" tray in-view, click-to-place, and the Explorer/Localiser modes.
```
