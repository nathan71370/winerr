# Winerr — Cave Configurator v2: flexible racks + visual builder (design)

**Date:** 2026-07-01
**Status:** Approved (brainstorm), pending plan
**Supersedes:** parts of the Layer-3 spec (`2026-07-01-winerr-3d-cellar-design.md` §3/§5) — the rigid 4-compartment diamond and the coordinate-input configurator.

## 1. Why

The shipped Layer 3 has two usability defects the user hit immediately:
1. **The diamond rack is rigid** — hardcoded to a single X = 4 fixed compartments (N/E/S/O). Real racks (per the user's cellar photo) are a **grid of X-cells** and must be dimensionable like the grid rack.
2. **The configurator asks for raw `gridX`/`gridY` numbers** — translating a real cellar into abstract coordinates is unusable. It needs a **visual builder**.

No data migration: nothing is placed in any deployed DB yet (`placements` shipped empty in migration 0004). The `storage_units` schema is unchanged (`cols`/`rows`/`gridX`/`gridY` already exist).

## 2. Locked decisions (brainstorm)

| Decision | Choice |
|---|---|
| **Diamond structure** | A diamond rack is `cols × rows` **cells**, each cell divided by a big X into **4 triangular bulk bins** (option B). Dimensionable exactly like the grid rack. |
| **Diamond precision** | **Per triangle.** Each cell's 4 triangles are individually addressable (Haut/Droite/Bas/Gauche → N/E/S/O). |
| **Compartment keys** | grid cell → `L{r}C{c}`; diamond triangle → `L{r}C{c}{d}` where `d ∈ {N,E,S,O}`. |
| **Configurator** | A **visual grid builder** replaces the coordinate form. Cubes are placed on a front-elevation grid (columns = side-by-side, rows = stack level, bottom = floor). |
| **Move** | **Drag-and-drop** a cube to another cell (HTML5 DnD). |
| **AI photo import** | Deferred to a follow-up phase (a button placeholder is fine, or omit). |

## 3. Model change (revise merged code — no schema change)

Both rack kinds are now `cols × rows`. `storageUnits.cols`/`rows` are required for **both** kinds (still nullable columns, but always populated by the app).

### `src/cave/compartments.ts`
`compartmentKeys(unit)` becomes:
- grid: `L{r}C{c}` for r in 1..rows, c in 1..cols (unchanged).
- diamond: `L{r}C{c}{d}` for r, c and d in `["N","E","S","O"]`.
- `[]` if dimensions missing.

`isValidCompartment` stays a membership check over `compartmentKeys`.

### `src/lib/validation.ts`
`unitSchema`: `cols`/`rows` become **required** (coerced int, 1..20) for both kinds (drop the "diamond has no dims" allowance).

### `src/cave/actions.ts`
`createUnitAction`/`updateUnitAction`: always persist `cols`/`rows` (remove the `kind === "grid" ? … : null` nulling and the grid-only dimension check — both kinds require dims via the schema now). The compartment-pruning in `updateUnitAction` already re-validates via `isValidCompartment`, so it correctly prunes placements orphaned by a diamond resize too.

### `src/cave/iso.ts`
`compartmentPolygon(unit, key, origin)`:
- grid `L{r}C{c}` → the cell rectangle (unchanged).
- diamond `L{r}C{c}{d}` → parse cell (r,c) → its rectangle → the triangle for direction `d` (N=top, E=right, S=bottom, O=left) meeting at the cell center.
- `[]` for malformed/out-of-range keys.

### `src/app/cave/CaveBoard.tsx`
**No change** — it already loops `compartmentKeys(unit)` and draws `compartmentPolygon` generically; diamonds simply yield more (triangle) polygons. The shared triangle edges render the cross-hatch/X pattern automatically.

### Tests to update
- `tests/cave-compartments.test.ts` — diamond now yields `L{r}C{c}{d}` keys.
- `tests/cave-iso.test.ts` — diamond polygon for a specific cell+direction.
- `tests/cave-validation.test.ts` — diamond now requires `cols`/`rows`.

## 4. Visual builder (replaces the coordinate form)

Replaces `src/app/cave/setup/UnitForm.tsx` + the list/form layout in `src/app/cave/setup/page.tsx` with a client **`CellarBuilder`** component.

**Layout:** a front-elevation grid. Columns = `gridX` (side by side), rows = level = `gridY` (bottom row = floor, level 0). Each existing unit occupies its `(gridX, gridY)` cell; empty cells show a `+`.

**Interactions:**
- **Click an empty cell** → an "add cube" inline picker: kind (grid/diamond) + `cols`×`rows` + optional name → `createUnitAction` with that cell's `gridX`/`gridY`.
- **Drag a cube** to another cell (HTML5 `draggable` + `onDragStart`/`onDrop`) → `moveUnitAction(unitId, gridX, gridY)`. Dropping on an occupied cell is a no-op (or swap — MVP: no-op, only empty targets accept).
- **Click a cube** → a side panel: edit name, kind, `cols`×`rows` (→ `updateUnitAction`), or delete (→ `deleteUnitAction`, warns bottles return to the tray).
- The grid auto-grows: always show one extra empty column on the right and one extra empty row on top so there's always room to place/stack.

**Server actions:** reuse `createUnitAction`/`updateUnitAction`/`deleteUnitAction`; add a lightweight **`moveUnitAction(formData)`** (`unitId`, `gridX`, `gridY`, ownership-scoped) so a drag doesn't need to re-submit every field.

**Rendering of a cube in a builder cell:** a small icon reflecting kind + dims (grid → mini lattice; diamond → mini cross-hatch) + the name. It does not need the full iso; the pretty iso stays on `/cave`.

## 5. Scope / phasing

- **Plan (this spec):** the model change (§3) + the visual builder (§4), as one implementation plan (they're coupled — the builder must expose diamond dims that the model now needs). Ships a usable, flexible configurator.
- **Deferred:** AI photo → layout import (own spec/plan later); drag-to-swap occupied cells; the keepsake box.

## 6. Testing

Pure/TDD first: the compartment-key + polygon changes (§3). Then the builder actions (`moveUnitAction`) and the builder UI (manual smoke + build). No new pure module beyond the revised `compartments.ts`/`iso.ts`.

## 7. Styling

Marathon tokens throughout; the builder grid uses the same warm cream/terracotta palette. Cube icons in pine tans, selected in terracotta.
