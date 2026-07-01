# Winerr — Layer 3: The 3D Cellar (design)

**Date:** 2026-07-01
**Status:** Approved (brainstorm), pending implementation plan
**Depends on:** Phases 1–3 (auth, catalog, cellar inventory, reviews) — all merged.

## 1. Goal

The "wow" layer. Reproduce the user's **real, physical** cellar so they can **find a bottle**: click a wine → its compartment lights up → they know where to walk. Not a decorative auto-arranged gallery — a faithful, addressable model of real storage furniture.

## 2. Locked decisions (from brainstorm)

| Decision | Choice |
|---|---|
| **Purpose** | Find-my-bottle (faithful physical model), not decorative showcase. |
| **Storage vocabulary** | Modular **cubes**, each configured as a **grid** (individual slots) or a **diamond/X bin** (4 bulk compartments N/E/S/O). Grounded in the user's actual cellar photo. |
| **Precision** | **Per-compartment.** A bottle lives in "Cube B · Ouest" or "Cube A · L2C3". Bins are bulk (no per-slot ordering); grid cells are effectively slots. |
| **Rendering** | **Isometric 2.5D** in SVG/CSS. No WebGL dependency — fits the self-hosted webpack/Docker build and the warm editorial Marathon aesthetic. |
| **Placement model** | Dedicated **`placements`** table so a wine's bottles can be **split across compartments** and track an **unplaced** remainder. |
| **Configurator** | Light form (add cube → name, type, dimensions, floor position). No drag-and-drop builder. |
| **Placement UX** | Click a compartment → deposit a wine + quantity, drawn from an "À ranger" tray. Plus a "Ranger dans…" field on the bottle add/edit form. No drag-and-drop. |

## 3. Data model

### New table `storage_units` (a cube)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `userId` | uuid fk users, cascade | ownership |
| `name` | text notNull | "Cube A", user-editable |
| `kind` | enum `storage_kind` = `grid` \| `diamond` | |
| `cols` | integer, nullable | grid only |
| `rows` | integer, nullable | grid only |
| `gridX` | integer notNull | horizontal slot in the cellar arrangement |
| `gridY` | integer notNull | stack level (0 = floor) |
| `createdAt` | timestamp notNull default now | |

New pg enum: `storage_kind` = `["grid", "diamond"]`.

Compartments are **not** a table — they are derived from the unit:
- `grid` → keys `L{r}C{c}` for r in 1..rows, c in 1..cols.
- `diamond` → fixed keys `N`, `E`, `S`, `O`.

### New table `placements` (bottles in a compartment)

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `cellarItemId` | uuid fk cellar_items, cascade | |
| `unitId` | uuid fk storage_units, cascade | |
| `compartment` | text notNull | a compartment key valid for the unit's kind |
| `quantity` | integer notNull | bottles of this item in this compartment (≥ 1) |
| `createdAt` | timestamp notNull default now | |

Index on `(cellarItemId)` and `(unitId)`.

### Changes to existing tables

- `cellar_items.location` (free text) becomes **obsolete**. Keep the column (harmless; drop is a deferred cleanup); the UI stops reading/writing it.

### Invariants (enforced in the service layer + tested)

1. **No over-placement:** for any cellar item, `Σ placements.quantity ≤ cellar_items.quantity`.
2. **Unplaced count** = `cellar_items.quantity − Σ placements.quantity` (≥ 0).
3. **Valid compartment key:** `placements.compartment` must be a legal key for its unit's kind/dimensions.
4. **Placement quantity ≥ 1** (a zero-quantity placement is deleted, not stored).
5. Only **in-cellar** items are placeable (a `drunk` item shouldn't hold placements).

## 4. Isometric rendering (pure, testable)

The rendering is split so the geometry is pure and unit-tested; components only draw SVG from computed coordinates.

- `projectUnit(gridX, gridY): {x, y}` — cellar grid → 2D iso anchor for a cube.
- `compartmentKeys(unit): string[]` — enumerate a unit's compartments.
- `compartmentPolygon(unit, key): Point[]` — the iso polygon for one compartment (for click targets + highlight).
- `parseCompartment(key)` / `isValidCompartment(unit, key)` — key ↔ structure.

Pure module (e.g. `src/cave/iso.ts` + `src/cave/compartments.ts`). No DB, no React.

## 5. Configurator

Route `/cave/setup` (or a panel within `/cave`). Light form:
- List of the user's cubes with an "+ Ajouter un cube" button.
- Per-cube fields: **name**, **type** (grid/diamond segmented control), **dimensions** (`cols`×`rows`, grid only), **position** (`gridX` column · `gridY` level).
- Live isometric preview of the arrangement reflecting edits.
- Delete a cube (see edge cases).

Server actions: `createUnitAction`, `updateUnitAction`, `deleteUnitAction` — all user-scoped via `requireUserId()`.

## 6. Placement ("Ranger")

Two entry points:

1. **From the cave view (primary):** click a compartment → popover listing its current contents (wine + ×qty, each removable) and a "+ Déposer un vin ici" control that picks from the "À ranger" tray (items with unplaced quantity > 0) and sets a quantity.
2. **From the bottle add/edit form:** a "Ranger dans…" field (cube → compartment → qty).

The **"À ranger" tray** shows every item with a non-zero unplaced remainder so nothing is forgotten.

Server actions: `placeBottlesAction(cellarItemId, unitId, compartment, qty)` and `unplaceAction(placementId, qty?)` — both enforce the §3 invariants (reject over-placement, validate the compartment key, delete on reaching zero).

## 7. Find / locate + view modes

`/cave` renders the full isometric cellar. One view, two modes:

- **Explorer** (default) — everything visible; click a compartment to inspect/place/remove.
- **Localiser** — triggered by a **"Localiser"** button on a cellar-list row or the wine-detail page (`?locate={cellarItemId}` or `?wine={wineId}`). The cellar dims to a muted state; the compartment(s) holding that wine **pulse in terracotta**. A dark banner shows the wine + its address(es). If the wine is split across compartments, all light up. If the wine is entirely unplaced, the banner says so and points to the tray.

Query: given a wine (or item), fetch its placements joined to units → the compartments to highlight.

## 8. Navigation & entry points

- The app has **no global nav** (bare `layout.tsx`; pages carry their own header). Add a **"Ma cave"** link to the **cellar page header** → `/cave`.
- Add a **"Localiser"** action to each cellar-list row and to the wine-detail page.

## 9. Edge cases & invariants

- **Drink a bottle (`markDrunkAction`):** after decrementing `quantity`, if `Σ placements > quantity`, trim placements (reduce/remove some) to restore invariant #1. A `reconcilePlacements(cellarItemId)` helper centralizes this. When the item flips to `drunk` (quantity 0), all its placements are removed.
- **Delete a cube:** its placements are deleted (cascade), so the bottles return to "À ranger" (unplaced) automatically — bottles are never destroyed by removing furniture. The confirmation warns how many bottles will be un-shelved.
- **Shrink a grid** below occupied cells, or **lower an item's quantity** below its placed total: run `reconcilePlacements` / reject, so no placement points at a non-existent cell and no invariant breaks. Editing a unit that would orphan compartments prompts a warning.
- **Edit bottle quantity down** (`updateBottleAction`): reconcile placements afterward.

## 10. Testing (TDD — pure functions first)

1. Pure geometry: `projectUnit`, `compartmentKeys`, `compartmentPolygon`, `isValidCompartment`/`parseCompartment`.
2. Pure placement logic: unplaced-count computation, over-placement rejection, `reconcilePlacements` trimming.
3. Service/actions: unit CRUD (ownership-scoped), place/unplace, drink-and-reconcile, delete-unit-unshelves.

## 11. Migration

Drizzle migration `0004`: `storage_kind` enum, `storage_units`, `placements`, indexes. `cellar_items.location` untouched (deferred drop). Runs via the existing boot migration path (`src/instrumentation.ts` → `src/db/migrate.ts`).

## 12. Phasing (two implementation plans, one spec)

- **Plan A — model + configurator + placement:** migration, `storage_units`/`placements` schema, pure compartment logic, unit CRUD + configurator form, placement service + "Ranger dans…" form field, invariants, tests. Ships functional (bottles get addresses) even before the pretty view.
- **Plan B — isometric view + Explorer/Localiser:** pure iso projection, the SVG cave components, click-to-inspect/place, the "À ranger" tray in-view, the Localiser mode + banner + pulse, "Ma cave"/"Localiser" nav entries.

## 13. Out of scope / deferred

- The **keepsake wooden box** ("À ouvrir le 18.10.2035") — ignored in this layer; revisit later (possibly a special unit kind with an "open-on" date).
- **Drag-and-drop** configurator and placement.
- True **WebGL** rendering.
- Dropping the obsolete `cellar_items.location` column.
- Free rotation / multiple camera angles (iso is a fixed projection).

## 14. Styling

Marathon tokens throughout (cream `#f7f5f0`/`#efeae0`, ink `#1a1614`, terracotta accent `#d85b3d`/`#b84527`, line `#e5ddd0`, wood tones for cube faces). Pine-cube faces in warm tans; highlight/pulse in terracotta. Mobile-first: the cave view pans/zooms and the whole flow works on a phone.
