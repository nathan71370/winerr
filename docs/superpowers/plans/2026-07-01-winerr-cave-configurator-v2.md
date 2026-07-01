# Cave Configurator v2 — Flexible Racks + Visual Builder (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make diamond racks dimensionable (`cols × rows` cells, each an X of 4 addressable triangles) and replace the coordinate-input configurator with a drag-and-drop visual grid builder.

**Architecture:** A pure-function model change (`compartmentKeys`/`compartmentPolygon` generalize the diamond to `L{r}C{c}{N|E|S|O}` keys) plus a UI replacement (`CellarBuilder` client component over a front-elevation grid, reusing the existing unit CRUD server actions + a new lightweight `moveUnitAction`). The `/cave` iso board needs NO change — it draws compartment polygons generically. No DB/schema/data migration (columns exist; nothing is placed).

**Tech Stack:** Next.js 16 (App Router, server actions, React 19 `useActionState`, HTML5 drag-and-drop), Drizzle, Zod, Vitest. Marathon CSS-var tokens.

**Reference:** spec `docs/superpowers/specs/2026-07-01-winerr-cave-configurator-v2-design.md`. Revises merged Layer-3 code.

---

## Baseline notes for every task
- `pnpm exec tsc --noEmit` has ~15 PRE-EXISTING errors only in `tests/ai-*.test.ts`. Add ZERO new.
- GPG signing is DISABLED locally — plain `git commit`, no `--no-gpg-sign`.
- `@` → `src`. Work from `/Users/nathanmercier/Documents/Project/frontend/winerr` on branch `cave-config-v2` (the controller creates it).

## File structure
- Modify `src/cave/compartments.ts` + `tests/cave-compartments.test.ts` — diamond keys.
- Modify `src/cave/iso.ts` + `tests/cave-iso.test.ts` — diamond triangle polygon.
- Modify `src/lib/validation.ts` + `tests/cave-validation.test.ts` — both kinds require dims.
- Modify `src/cave/actions.ts` — persist dims for both kinds; add `moveUnitAction`.
- Rewrite `src/app/cave/setup/UnitForm.tsx` → `src/app/cave/setup/CubeForm.tsx` (dims for both kinds; add/edit).
- Create `src/app/cave/setup/CellarBuilder.tsx` — the drag-and-drop grid.
- Rewrite `src/app/cave/setup/page.tsx` — render `CellarBuilder`.

---

## Task 1: Flexible diamond compartment keys

**Files:** Modify `src/cave/compartments.ts`; `tests/cave-compartments.test.ts`

- [ ] **Step 1: Replace the diamond expectations in the test**

Replace the ENTIRE contents of `tests/cave-compartments.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { compartmentKeys, isValidCompartment, type Unit } from "@/cave/compartments";

const diamond: Unit = { kind: "diamond", cols: 2, rows: 1 };
const grid: Unit = { kind: "grid", cols: 3, rows: 2 };

describe("compartmentKeys", () => {
  it("returns 4 triangle keys per cell for a diamond (row-major, N/E/S/O)", () => {
    expect(compartmentKeys(diamond)).toEqual([
      "L1C1N", "L1C1E", "L1C1S", "L1C1O",
      "L1C2N", "L1C2E", "L1C2S", "L1C2O",
    ]);
  });
  it("returns row-major L{r}C{c} keys for a grid", () => {
    expect(compartmentKeys(grid)).toEqual(["L1C1", "L1C2", "L1C3", "L2C1", "L2C2", "L2C3"]);
  });
  it("returns no keys when dimensions are missing", () => {
    expect(compartmentKeys({ kind: "grid", cols: null, rows: null })).toEqual([]);
    expect(compartmentKeys({ kind: "diamond", cols: null, rows: null })).toEqual([]);
  });
});

describe("isValidCompartment", () => {
  it("accepts a legal key and rejects an illegal one", () => {
    expect(isValidCompartment(diamond, "L1C1N")).toBe(true);
    expect(isValidCompartment(diamond, "L1C2O")).toBe(true);
    expect(isValidCompartment(diamond, "N")).toBe(false);        // old fixed key
    expect(isValidCompartment(diamond, "L1C1")).toBe(false);     // no direction
    expect(isValidCompartment(diamond, "L2C1N")).toBe(false);    // row out of range
    expect(isValidCompartment(grid, "L2C3")).toBe(true);
    expect(isValidCompartment(grid, "L2C3N")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/cave-compartments.test.ts`
Expected: FAIL — diamond currently returns `["N","E","S","O"]`.

- [ ] **Step 3: Update `src/cave/compartments.ts`**

Replace the file body (keep the `Unit` type) with:

```ts
// A cube is a `cols × rows` grid of cells. A "grid" cell is one square slot; a
// "diamond" cell is X-divided into 4 triangular bulk bins (N/E/S/O). Compartments
// are derived, never stored: grid → "L{r}C{c}"; diamond → "L{r}C{c}{N|E|S|O}".
export type Unit = {
  kind: "grid" | "diamond";
  cols: number | null;
  rows: number | null;
};

const DIRS = ["N", "E", "S", "O"] as const;

export function compartmentKeys(unit: Unit): string[] {
  const cols = unit.cols ?? 0;
  const rows = unit.rows ?? 0;
  const keys: string[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      if (unit.kind === "diamond") {
        for (const d of DIRS) keys.push(`L${r}C${c}${d}`);
      } else {
        keys.push(`L${r}C${c}`);
      }
    }
  }
  return keys;
}

export function isValidCompartment(unit: Unit, key: string): boolean {
  return compartmentKeys(unit).includes(key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/cave-compartments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cave/compartments.ts tests/cave-compartments.test.ts
git commit -m "feat(cave): dimensionable diamond racks — L{r}C{c}{dir} compartment keys"
```

---

## Task 2: Diamond triangle polygons

**Files:** Modify `src/cave/iso.ts`; `tests/cave-iso.test.ts`

- [ ] **Step 1: Replace the diamond polygon tests**

In `tests/cave-iso.test.ts`, replace the two `describe("compartmentPolygon (diamond)" ...)` / `describe("compartmentPolygon (grid)" ...)` blocks with:

```ts
describe("compartmentPolygon (diamond)", () => {
  const diamond: Unit = { kind: "diamond", cols: 2, rows: 1 };
  it("returns the north triangle of a cell (meeting at that cell's center)", () => {
    // cell (r1,c1): cw = CUBE/2, ch = CUBE; center = (CUBE/4, CUBE/2)
    const poly = compartmentPolygon(diamond, "L1C1N", { x: 0, y: 0 });
    expect(poly).toEqual([{ x: 0, y: 0 }, { x: CUBE / 2, y: 0 }, { x: CUBE / 4, y: CUBE / 2 }]);
  });
  it("returns the south triangle of the second cell", () => {
    const poly = compartmentPolygon(diamond, "L1C2S", { x: 0, y: 0 });
    const cw = CUBE / 2;
    expect(poly).toEqual([{ x: CUBE, y: CUBE }, { x: cw, y: CUBE }, { x: cw + cw / 2, y: CUBE / 2 }]);
  });
  it("returns [] for an out-of-range or malformed diamond key", () => {
    expect(compartmentPolygon(diamond, "L2C1N", { x: 0, y: 0 })).toEqual([]);
    expect(compartmentPolygon(diamond, "L1C1", { x: 0, y: 0 })).toEqual([]);
  });
});

describe("compartmentPolygon (grid)", () => {
  const grid: Unit = { kind: "grid", cols: 2, rows: 2 };
  it("returns the rectangle for a cell", () => {
    const poly = compartmentPolygon(grid, "L1C1", { x: 0, y: 0 });
    const h = CUBE / 2;
    expect(poly).toEqual([{ x: 0, y: 0 }, { x: h, y: 0 }, { x: h, y: h }, { x: 0, y: h }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/cave-iso.test.ts`
Expected: FAIL — diamond currently returns whole-face N/E/S/O triangles.

- [ ] **Step 3: Update `compartmentPolygon` in `src/cave/iso.ts`**

Replace the whole `compartmentPolygon` function with:

```ts
// Absolute SVG polygon for one compartment on the cube whose front-face top-left
// is `origin`. grid "L{r}C{c}" → the cell rectangle; diamond "L{r}C{c}{dir}" →
// the triangle for that direction within the cell, meeting at the cell center.
// Returns [] for a key invalid for the unit's kind/dimensions.
export function compartmentPolygon(unit: Unit, key: string, origin: Point): Point[] {
  const { x, y } = origin;
  const S = CUBE;
  const cols = unit.cols ?? 0;
  const rows = unit.rows ?? 0;
  if (cols <= 0 || rows <= 0) return [];

  if (unit.kind === "diamond") {
    const m = /^L(\d+)C(\d+)([NESO])$/.exec(key);
    if (!m) return [];
    const r = Number(m[1]) - 1, c = Number(m[2]) - 1, d = m[3];
    if (r < 0 || c < 0 || r >= rows || c >= cols) return [];
    const cw = S / cols, ch = S / rows;
    const x0 = x + c * cw, y0 = y + r * ch;
    const tl = { x: x0, y: y0 }, tr = { x: x0 + cw, y: y0 }, br = { x: x0 + cw, y: y0 + ch }, bl = { x: x0, y: y0 + ch };
    const ctr = { x: x0 + cw / 2, y: y0 + ch / 2 };
    switch (d) {
      case "N": return [tl, tr, ctr];
      case "E": return [tr, br, ctr];
      case "S": return [br, bl, ctr];
      case "O": return [bl, tl, ctr];
      default: return [];
    }
  }

  const m = /^L(\d+)C(\d+)$/.exec(key);
  if (!m) return [];
  const r = Number(m[1]) - 1, c = Number(m[2]) - 1;
  if (r < 0 || c < 0 || r >= rows || c >= cols) return [];
  const cw = S / cols, ch = S / rows;
  const x0 = x + c * cw, y0 = y + r * ch;
  return [{ x: x0, y: y0 }, { x: x0 + cw, y: y0 }, { x: x0 + cw, y: y0 + ch }, { x: x0, y: y0 + ch }];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/cave-iso.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cave/iso.ts tests/cave-iso.test.ts
git commit -m "feat(cave): per-cell triangle polygons for diamond racks"
```

---

## Task 3: Both rack kinds require dimensions

**Files:** Modify `src/lib/validation.ts`; `tests/cave-validation.test.ts`

- [ ] **Step 1: Update the unitSchema tests**

In `tests/cave-validation.test.ts`, replace the `describe("unitSchema", ...)` block with:

```ts
describe("unitSchema", () => {
  it("requires dimensions for a diamond too", () => {
    expect(unitSchema.safeParse({ name: "Cube B", kind: "diamond", gridX: "1", gridY: "0" }).success).toBe(false);
    const r = unitSchema.safeParse({ name: "Cube B", kind: "diamond", cols: "2", rows: "3", gridX: "1", gridY: "0" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ cols: 2, rows: 3 });
  });
  it("coerces grid dimensions and position to ints", () => {
    const r = unitSchema.safeParse({ name: "Cube A", kind: "grid", cols: "4", rows: "4", gridX: "0", gridY: "1" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ cols: 4, rows: 4, gridX: 0, gridY: 1 });
  });
  it("rejects an unknown kind and an empty name", () => {
    expect(unitSchema.safeParse({ name: "", kind: "grid", cols: "2", rows: "2", gridX: "0", gridY: "0" }).success).toBe(false);
    expect(unitSchema.safeParse({ name: "X", kind: "barrel", cols: "2", rows: "2", gridX: "0", gridY: "0" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/cave-validation.test.ts`
Expected: FAIL — a diamond without dims currently parses successfully.

- [ ] **Step 3: Make cols/rows required in `unitSchema`**

In `src/lib/validation.ts`, in `unitSchema`, change the `cols`/`rows` lines from optional to required:

```ts
  cols: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(20)),
  rows: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(20)),
```
(Leave `name`, `kind`, `gridX`, `gridY` as they are.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/cave-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts tests/cave-validation.test.ts
git commit -m "feat(cave): both rack kinds require cols/rows"
```

---

## Task 4: Actions — persist dims for both kinds + moveUnitAction

**Files:** Modify `src/cave/actions.ts`

- [ ] **Step 1: Persist dims for both kinds in create/update**

In `src/cave/actions.ts`, in `createUnitAction`: remove the line
`if (d.kind === "grid" && (!d.cols || !d.rows)) return { error: "Une grille exige des dimensions (colonnes × rangées)." };`
and change the insert's `cols`/`rows` from the `d.kind === "grid" ? d.cols ?? null : null` form to just:
```ts
    cols: d.cols,
    rows: d.rows,
```

In `updateUnitAction`: remove the line
`if (d.kind === "grid" && (!d.cols || !d.rows)) return { error: "Une grille exige des dimensions." };`
and change the update's `cols`/`rows` to:
```ts
      cols: d.cols,
      rows: d.rows,
```
(The schema now guarantees `d.cols`/`d.rows` are present ints for both kinds. The compartment-pruning block in `updateUnitAction` is unchanged — it already re-validates via `isValidCompartment`, so it prunes placements orphaned by a diamond resize too.)

- [ ] **Step 2: Add `moveUnitAction`**

Append to `src/cave/actions.ts`:

```ts
// Lightweight reposition for the visual builder's drag-and-drop: only moves a
// cube to a new (gridX, gridY). Ownership-scoped; silently no-ops on bad input.
export async function moveUnitAction(unitId: string, gridX: number, gridY: number) {
  const userId = await requireUserId();
  if (!unitId || !Number.isInteger(gridX) || !Number.isInteger(gridY) || gridX < 0 || gridY < 0) return;
  await db
    .update(storageUnits)
    .set({ gridX, gridY })
    .where(and(eq(storageUnits.id, unitId), eq(storageUnits.userId, userId)));
  revalidatePath("/cave/setup");
  revalidatePath("/cave");
}
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm exec tsc --noEmit` (no new errors), `pnpm test` (green).

```bash
git add src/cave/actions.ts
git commit -m "feat(cave): persist dims for both kinds + moveUnitAction for drag"
```

---

## Task 5: CubeForm (add/edit, dims for both kinds)

**Files:** Create `src/app/cave/setup/CubeForm.tsx`

(The old `UnitForm.tsx` stays in place and keeps `page.tsx` compiling until Task 7 replaces the page and removes it — so every commit's tree stays green.)

- [ ] **Step 1: Create `src/app/cave/setup/CubeForm.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import { createUnitAction, updateUnitAction } from "@/cave/actions";

export type CubeRow = { id: string; name: string; kind: "grid" | "diamond"; cols: number | null; rows: number | null; gridX: number; gridY: number };

// Add mode: pass gridX/gridY (the target cell). Edit mode: pass unit.
export function CubeForm({ unit, gridX, gridY, onSuccess }: { unit?: CubeRow; gridX?: number; gridY?: number; onSuccess?: () => void }) {
  const action = unit ? updateUnitAction : createUnitAction;
  const [state, formAction] = useActionState(action, null as { error?: string; ok?: boolean } | null);
  const [kind, setKind] = useState<"grid" | "diamond">(unit?.kind ?? "grid");

  useEffect(() => { if (state?.ok) onSuccess?.(); }, [state, onSuccess]);

  return (
    <form action={formAction} style={{ display: "grid", gap: "var(--s-3)" }}>
      {unit && <input type="hidden" name="unitId" value={unit.id} />}
      {!unit && <input type="hidden" name="gridX" value={gridX ?? 0} />}
      {!unit && <input type="hidden" name="gridY" value={gridY ?? 0} />}
      {unit && <input type="hidden" name="gridX" value={unit.gridX} />}
      {unit && <input type="hidden" name="gridY" value={unit.gridY} />}

      <input name="name" defaultValue={unit?.name ?? ""} placeholder="Nom du cube" required style={inp} />

      <div style={{ display: "flex", gap: "var(--s-2)" }}>
        <label style={segLabel(kind === "grid")}>
          <input type="radio" name="kind" value="grid" checked={kind === "grid"} onChange={() => setKind("grid")} style={{ display: "none" }} /> ▦ Grille
        </label>
        <label style={segLabel(kind === "diamond")}>
          <input type="radio" name="kind" value="diamond" checked={kind === "diamond"} onChange={() => setKind("diamond")} style={{ display: "none" }} /> ◇ Losange
        </label>
      </div>

      <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
        <input name="cols" type="number" min={1} max={20} defaultValue={unit?.cols ?? 4} style={{ ...inp, width: 64 }} aria-label="colonnes" />
        <span style={{ color: "var(--ink-mute)" }}>×</span>
        <input name="rows" type="number" min={1} max={20} defaultValue={unit?.rows ?? 4} style={{ ...inp, width: 64 }} aria-label="rangées" />
        <span style={{ fontSize: "var(--t-meta)", color: "var(--ink-mute)" }}>{kind === "diamond" ? "cellules (× 4 triangles)" : "colonnes × rangées"}</span>
      </div>

      {state?.error && <p style={{ color: "var(--warn)", fontSize: "var(--t-small)" }}>{state.error}</p>}
      <button style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "var(--s-2) var(--s-4)", cursor: "pointer" }}>
        {unit ? "Enregistrer" : "Ajouter le cube"}
      </button>
    </form>
  );
}

function segLabel(active: boolean): React.CSSProperties {
  return { flex: 1, textAlign: "center", fontSize: "var(--t-small)", padding: "var(--s-2)", borderRadius: "var(--radius-sm)", cursor: "pointer", border: `1.5px solid ${active ? "var(--accent)" : "var(--line)"}`, background: active ? "var(--cream-deep)" : "var(--card)", color: active ? "var(--accent-deep)" : "var(--ink-soft)", fontWeight: active ? 600 : 400 };
}

const inp: React.CSSProperties = { padding: "var(--s-2) var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)" };
```

- [ ] **Step 2: Verify compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors (the old `UnitForm.tsx` is still present, so `page.tsx` still compiles).

- [ ] **Step 3: Commit**

```bash
git add src/app/cave/setup/CubeForm.tsx
git commit -m "feat(cave): CubeForm — add/edit with dims for both rack kinds"
```

---

## Task 6: CellarBuilder (drag-and-drop grid)

**Files:** Create `src/app/cave/setup/CellarBuilder.tsx`

- [ ] **Step 1: Create `src/app/cave/setup/CellarBuilder.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { moveUnitAction, deleteUnitAction } from "@/cave/actions";
import { CubeForm, type CubeRow } from "./CubeForm";

const CELL = 92;

export function CellarBuilder({ units }: { units: CubeRow[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ gridX: number; gridY: number } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const maxX = units.length ? Math.max(...units.map((u) => u.gridX)) : 0;
  const maxY = units.length ? Math.max(...units.map((u) => u.gridY)) : 0;
  const cols = maxX + 2;               // one spare column
  const levels = maxY + 2;             // one spare level
  const at = (x: number, y: number) => units.find((u) => u.gridX === x && u.gridY === y);

  function drop(x: number, y: number) {
    if (!dragId || at(x, y)) return;
    const id = dragId;
    setDragId(null);
    startTransition(() => { moveUnitAction(id, x, y); });
  }

  const selectedUnit = units.find((u) => u.id === selected) ?? null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "var(--s-5)", alignItems: "start" }}>
      <div style={{ overflow: "auto", background: "var(--cream-deep)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "var(--s-4)" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${CELL}px)`, gap: 10, justifyContent: "start" }}>
          {/* render top level first (highest gridY), floor last */}
          {Array.from({ length: levels }).flatMap((_, rowFromTop) => {
            const y = levels - 1 - rowFromTop;
            return Array.from({ length: cols }).map((__, x) => {
              const u = at(x, y);
              if (u) {
                return (
                  <div
                    key={`${x}-${y}`}
                    draggable
                    onDragStart={() => setDragId(u.id)}
                    onClick={() => { setSelected(u.id); setAdding(null); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(u.id); setAdding(null); } }}
                    aria-label={`${u.name}, ${u.kind === "diamond" ? "losange" : "grille"} ${u.cols}×${u.rows}`}
                    style={{ height: CELL, border: `2px solid ${selected === u.id ? "var(--accent)" : "var(--line)"}`, borderRadius: 8, background: "var(--card)", cursor: "grab", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", boxShadow: selected === u.id ? "0 0 0 3px rgba(216,91,61,.25)" : "none" }}
                  >
                    <CubeIcon kind={u.kind} />
                    <span style={{ position: "absolute", bottom: 3, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "var(--ink-mute)" }}>{u.name}</span>
                  </div>
                );
              }
              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => { setAdding({ gridX: x, gridY: y }); setSelected(null); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(x, y)}
                  style={{ height: CELL, border: "2px dashed var(--line)", borderRadius: 8, background: adding && adding.gridX === x && adding.gridY === y ? "var(--cream)" : "transparent", color: "var(--ink-mute)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}
                >
                  +
                </div>
              );
            });
          })}
        </div>
        <p style={{ fontSize: "var(--t-meta)", color: "var(--ink-mute)", marginTop: "var(--s-3)" }}>
          Clique une case « + » pour poser un cube. Glisse un cube pour le déplacer / l'empiler. La rangée du bas est posée par terre.
        </p>
      </div>

      <aside style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "var(--s-4)" }}>
        {adding ? (
          <>
            <h3 style={{ fontSize: "var(--t-h3)", marginBottom: "var(--s-3)" }}>Nouveau cube</h3>
            <CubeForm gridX={adding.gridX} gridY={adding.gridY} onSuccess={() => setAdding(null)} />
            <button onClick={() => setAdding(null)} style={ghostBtn}>Annuler</button>
          </>
        ) : selectedUnit ? (
          <>
            <h3 style={{ fontSize: "var(--t-h3)", marginBottom: "var(--s-3)" }}>{selectedUnit.name}</h3>
            <CubeForm unit={selectedUnit} onSuccess={() => setSelected(null)} />
            <form action={deleteUnitAction} style={{ marginTop: "var(--s-3)" }}>
              <input type="hidden" name="unitId" value={selectedUnit.id} />
              <button style={{ ...ghostBtn, color: "var(--warn)", borderColor: "var(--line)" }}>Supprimer (les bouteilles reviennent « à ranger »)</button>
            </form>
          </>
        ) : (
          <p style={{ fontSize: "var(--t-small)", color: "var(--ink-mute)" }}>Sélectionne un cube pour l’éditer, ou clique une case « + » pour en ajouter un.</p>
        )}
      </aside>
    </div>
  );
}

function CubeIcon({ kind }: { kind: "grid" | "diamond" }) {
  if (kind === "diamond") {
    return (
      <svg viewBox="0 0 40 40" width={44} height={44} aria-hidden>
        <rect x="4" y="4" width="32" height="32" fill="#e7dcc6" stroke="#b79a6a" strokeWidth={1.5} />
        <line x1="20" y1="4" x2="20" y2="36" stroke="#c9b896" strokeWidth={1} />
        <line x1="4" y1="20" x2="36" y2="20" stroke="#c9b896" strokeWidth={1} />
        <path d="M4 4 L20 20 L4 36 M36 4 L20 20 L36 36" stroke="#a6784a" strokeWidth={1.5} fill="none" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" width={44} height={44} aria-hidden>
      <rect x="4" y="4" width="32" height="32" fill="#e7dcc6" stroke="#b79a6a" strokeWidth={1.5} />
      <line x1="15" y1="4" x2="15" y2="36" stroke="#c9b896" strokeWidth={1} />
      <line x1="26" y1="4" x2="26" y2="36" stroke="#c9b896" strokeWidth={1} />
      <line x1="4" y1="15" x2="36" y2="15" stroke="#c9b896" strokeWidth={1} />
      <line x1="4" y1="26" x2="36" y2="26" stroke="#c9b896" strokeWidth={1} />
    </svg>
  );
}

const ghostBtn: React.CSSProperties = { width: "100%", marginTop: "var(--s-3)", background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "var(--s-2)", fontSize: "var(--t-small)", color: "var(--ink-soft)", cursor: "pointer" };
```

- [ ] **Step 2: Verify compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors (page.tsx's stale UnitForm import may still error until Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/app/cave/setup/CellarBuilder.tsx
git commit -m "feat(cave): CellarBuilder drag-and-drop grid configurator"
```

---

## Task 7: Rewrite the setup page to use CellarBuilder

**Files:** Modify `src/app/cave/setup/page.tsx`; Delete `src/app/cave/setup/UnitForm.tsx`

- [ ] **Step 1: Replace `src/app/cave/setup/page.tsx` entirely**

```tsx
import { requireUserId } from "@/auth/require-user";
import { listUnits } from "@/cave/queries";
import { CellarBuilder } from "./CellarBuilder";
import type { CubeRow } from "./CubeForm";

export default async function CaveSetupPage() {
  const userId = await requireUserId();
  const units = await listUnits(userId);
  const rows: CubeRow[] = units.map((u) => ({ id: u.id, name: u.name, kind: u.kind, cols: u.cols, rows: u.rows, gridX: u.gridX, gridY: u.gridY }));

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--s-5)" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>Configurer ma cave</h1>
        <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "baseline" }}>
          <a href="/cave" style={{ fontSize: "var(--t-small)" }}>Vue 3D</a>
          <a href="/cellar" style={{ fontSize: "var(--t-small)" }}>Liste</a>
        </div>
      </header>
      <CellarBuilder units={rows} />
    </main>
  );
}
```

- [ ] **Step 2: Remove the now-unused old form**

```bash
git rm src/app/cave/setup/UnitForm.tsx
```

- [ ] **Step 3: Verify — type-check, build, test**

Run: `pnpm exec tsc --noEmit` (no new errors; the old UnitForm import is gone), then `pnpm build` (succeeds; `/cave/setup` in the route list), then `pnpm test` (all green — includes the updated cave-compartments/iso/validation tests).

- [ ] **Step 4: Commit**

```bash
git add src/app/cave/setup/page.tsx src/app/cave/setup/UnitForm.tsx
git commit -m "feat(cave): setup page uses the visual CellarBuilder"
```

---

## Task 8: Full verification

- [ ] **Step 1:** `pnpm test` — all green.
- [ ] **Step 2:** `pnpm exec tsc --noEmit` — no new errors beyond the pre-existing tests/ai-*.test.ts baseline.
- [ ] **Step 3:** `pnpm build` — succeeds; `/cave/setup` and `/cave` both present.
- [ ] **Step 4: CONTROLLER CHECKPOINT** — regenerate the static iso preview (the scratchpad `cave-preview.ts` script that imports the real `src/cave/iso.ts`) with a DIAMOND rack of e.g. 2×2 cells so the per-cell triangles render, and eyeball that the cross-hatch/X pattern looks right on `/cave`. Adjust nothing in geometry unless it reads wrong.
- [ ] **Step 5: Manual smoke (dev DB)** — `/cave/setup`: add a grid 4×4 and a diamond 2×3 by clicking `+` cells; drag a cube to stack it; edit a cube's dims; delete one. Then `/cave`: the diamond renders as a 2×3 cross-hatch of X-cells; placing a bottle into one triangle highlights just that triangle on "Localiser".

## Done when

- A diamond rack is `cols × rows` cells with 4 addressable triangles each; both kinds require dimensions; `/cave` renders diamonds as a cross-hatch with per-triangle highlight.
- `/cave/setup` is a drag-and-drop visual grid — no coordinate typing.
- `pnpm test`, `tsc`, `build` green.
- **Deferred next:** AI photo → layout import (own spec/plan).
```
