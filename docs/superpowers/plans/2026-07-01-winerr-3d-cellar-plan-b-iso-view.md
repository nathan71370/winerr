# 3D Cellar — Plan B: Isometric View + Locate

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The "wow" payoff — an isometric `/cave` view that draws the user's cubes and compartments in 2.5D, lets them place/inspect bottles in-view via an "À ranger" tray, and highlights (pulses) the compartment(s) holding a wine when they click "Localiser".

**Architecture:** Pure, unit-tested SVG geometry (`src/cave/iso.ts`) projects each cube (a 2.5D extruded square, arranged on a gridX×gridY board) and returns clickable compartment polygons. A client `CaveBoard` component renders the SVG and owns interaction (select compartment → inspect/place/remove, reusing the Plan A server actions). The `/cave` page loads data server-side and supports a `?wine=` locate mode that dims the board and pulses the target compartments. A migration hardens the placement invariant (unique constraint + transaction).

**Tech Stack:** Next.js 16 (App Router, server components + server actions, `searchParams`), Drizzle ORM + Postgres, React 19, Vitest. Marathon CSS-var tokens. No WebGL (isometric SVG/CSS per the design spec).

**Reference:** spec `docs/superpowers/specs/2026-07-01-winerr-3d-cellar-design.md` (§4 iso rendering, §7 view modes, §14b fast-follows). Builds on Plan A (merged): `storage_units`, `placements`, `src/cave/{compartments,placement,queries,actions}.ts`.

**Plan A recap (already on `main`):** `compartmentKeys(unit)`/`isValidCompartment(unit,key)` in `src/cave/compartments.ts`; `unplacedTray(userId)`/`listUnits`/`listPlacementsForItem` in `src/cave/queries.ts`; `placeBottlesAction(formData)`/`unplaceAction(formData)`/`createUnitAction`/`updateUnitAction`/`deleteUnitAction`/`reconcileItemPlacements` in `src/cave/actions.ts`; `type Unit = { kind:"grid"|"diamond"; cols:number|null; rows:number|null }`.

---

## Design decisions locked for Plan B

- **Cube rendering = a 2.5D extruded square.** Each cube's interactive FRONT face is a straight square of side `CUBE` px; a top and right parallelogram (offset by a depth vector) give volume. Cubes are laid out on a board by `gridX` (left→right) and `gridY` (stack level, 0 = bottom row). This reads as a wall of modular cubbies (faithful to the user's real cellar) and keeps compartment click-targets as simple flat polygons.
- **Compartments as polygons on the front face:** `diamond` → 4 triangles (N/E/S/O) meeting at the face center; `grid` → `cols×rows` rectangles.
- **No per-compartment capacity limit.** A compartment shows a bottle count; nothing caps it (consistent with Plan A's per-compartment precision). Grid cells display `×N` when N>1.
- **Locate mode is URL-driven:** `/cave?wine=<wineId>` (server reads it, computes the highlight set). Explorer mode is the default (no query).

## File structure (Plan B)

- Create `src/cave/iso.ts` — pure geometry: `projectUnit`, `boardSize`, `compartmentPolygon`, `pointsAttr`.
- Create `tests/cave-iso.test.ts`.
- Modify `src/cave/queries.ts` — add `caveContents(userId)`, `locateWinePlacements(userId, wineId)`.
- Create `src/cave/group.ts` — pure: `groupContents` (rows → per-compartment map) + `highlightSet`. Test `tests/cave-group.test.ts`.
- Create `src/app/cave/CaveBoard.tsx` — client SVG board + interaction + tray + locate styling.
- Create `src/app/cave/page.tsx` — server page: load data, Explorer/Locate, render board.
- Modify `src/db/schema.ts` + `drizzle/0005_*.sql` — unique index on `(cellar_item_id, unit_id, compartment)`.
- Modify `src/cave/actions.ts` — wrap `placeBottlesAction` read-modify-write in a transaction.
- Modify `src/app/cellar/page.tsx` — point "Ma cave (3D)" to `/cave`; add a "Localiser" link per row.
- Modify `src/app/wine/[id]/page.tsx` — add a "Localiser dans ma cave" link.

---

## Task 1: Pure isometric geometry

**Files:**
- Create: `src/cave/iso.ts`
- Test: `tests/cave-iso.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { projectUnit, boardSize, compartmentPolygon, pointsAttr, CUBE, GAP, MARGIN } from "@/cave/iso";
import type { Unit } from "@/cave/compartments";

describe("projectUnit", () => {
  it("places gridY=0 on the bottom row and gridX left→right", () => {
    // rows = 2 total levels. gridY 1 is the top row, gridY 0 the bottom row.
    expect(projectUnit(0, 1, 2)).toEqual({ x: MARGIN, y: MARGIN });
    expect(projectUnit(0, 0, 2)).toEqual({ x: MARGIN, y: MARGIN + (CUBE + GAP) });
    expect(projectUnit(1, 1, 2)).toEqual({ x: MARGIN + (CUBE + GAP), y: MARGIN });
  });
});

describe("boardSize", () => {
  it("covers the extent of the units plus margins", () => {
    const s = boardSize([{ gridX: 0, gridY: 0 }, { gridX: 1, gridY: 0 }]);
    expect(s.width).toBeGreaterThan(2 * CUBE);
    expect(s.height).toBeGreaterThan(CUBE);
  });
  it("has a sane default for an empty cellar", () => {
    expect(boardSize([])).toEqual({ width: CUBE + 2 * MARGIN, height: CUBE + 2 * MARGIN });
  });
});

describe("compartmentPolygon (diamond)", () => {
  const diamond: Unit = { kind: "diamond", cols: null, rows: null };
  it("returns the north triangle meeting at the face center", () => {
    const poly = compartmentPolygon(diamond, "N", { x: 0, y: 0 });
    expect(poly).toEqual([{ x: 0, y: 0 }, { x: CUBE, y: 0 }, { x: CUBE / 2, y: CUBE / 2 }]);
  });
  it("returns [] for an invalid key", () => {
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

describe("pointsAttr", () => {
  it("formats points for an SVG polygon", () => {
    expect(pointsAttr([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe("0,0 10,5");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/cave-iso.test.ts`
Expected: FAIL — cannot resolve `@/cave/iso`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/cave/iso.ts
// Pure SVG geometry for the isometric cave. A cube's interactive FRONT face is a
// straight CUBE×CUBE square; depth parallelograms (drawn by the component) add
// 2.5D volume. Cubes are arranged on a board by gridX (left→right) and gridY
// (stack level, 0 = bottom). Compartments are flat polygons on the front face.
import type { Unit } from "@/cave/compartments";

export const CUBE = 96;    // front-face side, px
export const GAP = 18;     // gap between cubes, px
export const MARGIN = 28;  // board padding, px
export const DEPTH_X = 16; // extrusion vector x (right)
export const DEPTH_Y = 12; // extrusion vector y (up = negative screen-y)

export type Point = { x: number; y: number };

// Top-left of a cube's front face. `rows` = total stack levels (max gridY + 1)
// so gridY 0 renders on the bottom row.
export function projectUnit(gridX: number, gridY: number, rows: number): Point {
  const pitch = CUBE + GAP;
  return { x: MARGIN + gridX * pitch, y: MARGIN + (rows - 1 - gridY) * pitch };
}

// Overall SVG canvas size for a set of units (adds headroom for the extrusion).
export function boardSize(units: { gridX: number; gridY: number }[]): { width: number; height: number } {
  if (units.length === 0) return { width: CUBE + 2 * MARGIN, height: CUBE + 2 * MARGIN };
  const pitch = CUBE + GAP;
  const maxX = Math.max(...units.map((u) => u.gridX));
  const maxY = Math.max(...units.map((u) => u.gridY));
  return {
    width: 2 * MARGIN + maxX * pitch + CUBE + DEPTH_X,
    height: 2 * MARGIN + maxY * pitch + CUBE + DEPTH_Y,
  };
}

// Absolute SVG polygon for one compartment on the cube whose front-face top-left
// is `origin`. Returns [] for a key invalid for the unit's kind/dimensions.
export function compartmentPolygon(unit: Unit, key: string, origin: Point): Point[] {
  const { x, y } = origin;
  const S = CUBE;
  if (unit.kind === "diamond") {
    const tl = { x, y }, tr = { x: x + S, y }, br = { x: x + S, y: y + S }, bl = { x, y: y + S };
    const c = { x: x + S / 2, y: y + S / 2 };
    switch (key) {
      case "N": return [tl, tr, c];
      case "E": return [tr, br, c];
      case "S": return [br, bl, c];
      case "O": return [bl, tl, c];
      default: return [];
    }
  }
  const m = /^L(\d+)C(\d+)$/.exec(key);
  if (!m) return [];
  const cols = unit.cols ?? 0, rows = unit.rows ?? 0;
  const r = Number(m[1]) - 1, c = Number(m[2]) - 1;
  if (cols <= 0 || rows <= 0 || r < 0 || c < 0 || r >= rows || c >= cols) return [];
  const cw = S / cols, ch = S / rows;
  const x0 = x + c * cw, y0 = y + r * ch;
  return [{ x: x0, y: y0 }, { x: x0 + cw, y: y0 }, { x: x0 + cw, y: y0 + ch }, { x: x0, y: y0 + ch }];
}

// Format points for an SVG <polygon points="..."> attribute.
export function pointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/cave-iso.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cave/iso.ts tests/cave-iso.test.ts
git commit -m "feat(cave): pure isometric geometry (project, board, polygons)"
```

---

## Task 2: Pure grouping + highlight helpers

**Files:**
- Create: `src/cave/group.ts`
- Test: `tests/cave-group.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { compartmentId, groupContents, highlightSet } from "@/cave/group";

const rows = [
  { placementId: "p1", unitId: "u1", compartment: "N", quantity: 2, itemId: "i1", wineId: "w1", producer: "Léoni", cuvee: null, vintage: 2019, color: "rouge" },
  { placementId: "p2", unitId: "u1", compartment: "N", quantity: 1, itemId: "i2", wineId: "w2", producer: "Charme", cuvee: null, vintage: 2021, color: "rouge" },
  { placementId: "p3", unitId: "u2", compartment: "L1C1", quantity: 1, itemId: "i3", wineId: "w1", producer: "Léoni", cuvee: null, vintage: 2019, color: "rouge" },
];

describe("compartmentId", () => {
  it("joins unit + compartment stably", () => {
    expect(compartmentId("u1", "N")).toBe("u1:N");
  });
});

describe("groupContents", () => {
  it("groups placement rows by compartment id", () => {
    const g = groupContents(rows);
    expect(g.get("u1:N")?.length).toBe(2);
    expect(g.get("u2:L1C1")?.length).toBe(1);
    expect(g.get("u1:N")?.[0].producer).toBe("Léoni");
  });
});

describe("highlightSet", () => {
  it("builds the set of compartment ids holding a wine's placements", () => {
    const placements = [{ unitId: "u1", compartment: "N" }, { unitId: "u2", compartment: "L1C1" }];
    const s = highlightSet(placements);
    expect(s.has("u1:N")).toBe(true);
    expect(s.has("u2:L1C1")).toBe(true);
    expect(s.has("u1:E")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/cave-group.test.ts`
Expected: FAIL — cannot resolve `@/cave/group`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/cave/group.ts
// Pure helpers to shape cave data for rendering. A "compartment id" is the
// stable "<unitId>:<compartment>" key used everywhere the board addresses a slot.
export function compartmentId(unitId: string, compartment: string): string {
  return `${unitId}:${compartment}`;
}

export type ContentRow = {
  placementId: string;
  unitId: string;
  compartment: string;
  quantity: number;
  itemId: string;
  wineId: string;
  producer: string;
  cuvee: string | null;
  vintage: number | null;
  color: string | null;
};

// Group placement/content rows by compartment id → the bottles in that compartment.
export function groupContents(rows: ContentRow[]): Map<string, ContentRow[]> {
  const map = new Map<string, ContentRow[]>();
  for (const row of rows) {
    const id = compartmentId(row.unitId, row.compartment);
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

// The set of compartment ids that hold a located wine's placements.
export function highlightSet(placements: { unitId: string; compartment: string }[]): Set<string> {
  return new Set(placements.map((p) => compartmentId(p.unitId, p.compartment)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/cave-group.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cave/group.ts tests/cave-group.test.ts
git commit -m "feat(cave): pure grouping + highlight-set helpers"
```

---

## Task 3: Cave content queries

**Files:**
- Modify: `src/cave/queries.ts`

> DB reads; no unit test (matches the queries.ts convention). The pure `groupContents`/`highlightSet` that consume these are already tested.

- [ ] **Step 1: Append two queries to `src/cave/queries.ts`**

The file already imports `{ and, eq }` from `drizzle-orm`, `{ db }`, and `{ storageUnits, placements, cellarItems, wines }`. Append:

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors (baseline: ~15 pre-existing in tests/ai-*.test.ts).

- [ ] **Step 3: Commit**

```bash
git add src/cave/queries.ts
git commit -m "feat(cave): caveContents + locateWinePlacements queries"
```

---

## Task 4: The CaveBoard component (static render + tray)

**Files:**
- Create: `src/app/cave/CaveBoard.tsx`

This client component renders the SVG board and the tray. Interaction (selecting a compartment, place/remove) is added in Task 5; locate styling in Task 6 — but the props for those are wired now so later tasks only add behavior.

- [ ] **Step 1: Create `src/app/cave/CaveBoard.tsx`**

```tsx
"use client";

import { useState } from "react";
import { projectUnit, boardSize, compartmentPolygon, pointsAttr, CUBE, DEPTH_X, DEPTH_Y } from "@/cave/iso";
import { compartmentKeys, type Unit } from "@/cave/compartments";
import { compartmentId, groupContents, type ContentRow } from "@/cave/group";
import { placeBottlesAction, unplaceAction } from "@/cave/actions";

export type BoardUnit = { id: string; name: string; kind: "grid" | "diamond"; cols: number | null; rows: number | null; gridX: number; gridY: number };
export type TrayItem = { itemId: string; producer: string; cuvee: string | null; vintage: number | null; color: string | null; unplaced: number };

const colorHex: Record<string, string> = { rouge: "#8f2f24", blanc: "#d9c27a", rose: "#d98fa0", effervescent: "#c9a06a" };

export function CaveBoard({
  units, contents, tray, highlight, locate,
}: {
  units: BoardUnit[];
  contents: ContentRow[];
  tray: TrayItem[];
  highlight: string[];       // compartment ids to pulse (locate mode)
  locate: { wineLabel: string } | null;
}) {
  const [selected, setSelected] = useState<string | null>(null); // "unitId:compartment"
  const grouped = groupContents(contents);
  const highlightSet = new Set(highlight);
  const rows = units.length ? Math.max(...units.map((u) => u.gridY)) + 1 : 1;
  const { width, height } = boardSize(units);

  const wineLabel = (r: ContentRow) => `${r.producer}${r.cuvee ? " · " + r.cuvee : ""}${r.vintage ? " " + r.vintage : ""}`;
  const selectedRows = selected ? grouped.get(selected) ?? [] : [];
  const selectedUnitId = selected ? selected.split(":")[0] : null;
  const selectedCompartment = selected ? selected.slice(selected.indexOf(":") + 1) : null;

  return (
    <div>
      <style>{`@keyframes cavePulse {0%,100%{opacity:.55}50%{opacity:1}} .cave-glow{animation:cavePulse 1.4s ease-in-out infinite}`}</style>

      {locate && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", background: "var(--ink)", color: "var(--cream)", borderRadius: "var(--radius)", padding: "var(--s-3) var(--s-4)", marginBottom: "var(--s-4)" }}>
          <b style={{ fontSize: "var(--t-body)" }}>{locate.wineLabel}</b>
          <span style={{ marginLeft: "auto", fontSize: "var(--t-small)", color: "var(--accent)" }}>
            {highlight.length > 0 ? `${highlight.length} compartiment(s)` : "aucune bouteille rangée"}
          </span>
        </div>
      )}

      <div style={{ overflow: "auto", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--cream-deep)" }}>
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ maxWidth: "100%", display: "block" }}>
          {units.map((u) => {
            const origin = projectUnit(u.gridX, u.gridY, rows);
            const unit: Unit = { kind: u.kind, cols: u.cols, rows: u.rows };
            const keys = compartmentKeys(unit);
            // depth extrusion (top + right faces)
            const top = pointsAttr([{ x: origin.x, y: origin.y }, { x: origin.x + DEPTH_X, y: origin.y - DEPTH_Y }, { x: origin.x + CUBE + DEPTH_X, y: origin.y - DEPTH_Y }, { x: origin.x + CUBE, y: origin.y }]);
            const right = pointsAttr([{ x: origin.x + CUBE, y: origin.y }, { x: origin.x + CUBE + DEPTH_X, y: origin.y - DEPTH_Y }, { x: origin.x + CUBE + DEPTH_X, y: origin.y + CUBE - DEPTH_Y }, { x: origin.x + CUBE, y: origin.y + CUBE }]);
            return (
              <g key={u.id}>
                <polygon points={top} fill="#d8c9aa" stroke="#b79a6a" strokeWidth={1.5} />
                <polygon points={right} fill="#c9b896" stroke="#b79a6a" strokeWidth={1.5} />
                <rect x={origin.x} y={origin.y} width={CUBE} height={CUBE} fill="#efe7d8" stroke="#b79a6a" strokeWidth={1.5} />
                {keys.map((key) => {
                  const id = compartmentId(u.id, key);
                  const poly = compartmentPolygon(unit, key, origin);
                  const bottles = grouped.get(id) ?? [];
                  const count = bottles.reduce((s, b) => s + b.quantity, 0);
                  const dimmed = highlightSet.size > 0 && !highlightSet.has(id);
                  const glow = highlightSet.has(id);
                  const fill = count > 0 ? colorHex[bottles[0].color ?? ""] ?? "#a08" : "transparent";
                  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
                  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
                  return (
                    <g key={id} onClick={() => setSelected(id)} style={{ cursor: "pointer", opacity: dimmed ? 0.28 : 1 }}>
                      <polygon points={pointsAttr(poly)} className={glow ? "cave-glow" : undefined}
                        fill={glow ? "var(--accent)" : fill} fillOpacity={glow ? 0.9 : count > 0 ? 0.85 : 0}
                        stroke={selected === id ? "var(--accent-deep)" : "#a6784a"} strokeWidth={selected === id ? 2.5 : 0.8} />
                      {count > 0 && !glow && (
                        <text x={cx} y={cy + 3} textAnchor="middle" fontSize={11} fill="#fff" fontWeight={700}>{count}</text>
                      )}
                    </g>
                  );
                })}
                <text x={origin.x + CUBE / 2} y={origin.y + CUBE + 14} textAnchor="middle" fontSize={10} fill="var(--ink-mute)">{u.name}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {selected && (
        <CompartmentPanel
          unitName={units.find((u) => u.id === selectedUnitId)?.name ?? "?"}
          compartment={selectedCompartment ?? ""}
          unitId={selectedUnitId ?? ""}
          rows={selectedRows}
          tray={tray}
          onClose={() => setSelected(null)}
          label={wineLabel}
        />
      )}

      <div style={{ marginTop: "var(--s-4)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "var(--s-3) var(--s-4)" }}>
        <div style={{ fontSize: "var(--t-meta)", color: "var(--accent-deep)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>
          À ranger — {tray.reduce((s, t) => s + t.unplaced, 0)} bouteille(s)
        </div>
        {tray.length === 0 ? (
          <p style={{ fontSize: "var(--t-small)", color: "var(--ink-mute)", marginTop: "var(--s-2)" }}>Tout est rangé.</p>
        ) : (
          <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap", marginTop: "var(--s-2)" }}>
            {tray.map((t) => (
              <span key={t.itemId} style={{ display: "flex", alignItems: "center", gap: "var(--s-1)", fontSize: "var(--t-small)", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "2px 10px" }}>
                <span style={{ width: 7, height: 16, borderRadius: 2, background: colorHex[t.color ?? ""] ?? "#a08" }} />
                {t.producer}{t.vintage ? ` ${t.vintage}` : ""} <b style={{ color: "var(--accent-deep)" }}>×{t.unplaced}</b>
              </span>
            ))}
          </div>
        )}
        <p style={{ fontSize: "var(--t-meta)", color: "var(--ink-mute)", marginTop: "var(--s-2)" }}>Clique un compartiment pour y déposer une bouteille.</p>
      </div>
    </div>
  );
}

function CompartmentPanel({
  unitName, compartment, unitId, rows, tray, onClose, label,
}: {
  unitName: string; compartment: string; unitId: string;
  rows: ContentRow[]; tray: TrayItem[]; onClose: () => void; label: (r: ContentRow) => string;
}) {
  const placeable = tray.filter((t) => t.unplaced > 0);
  return (
    <div style={{ marginTop: "var(--s-4)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "var(--s-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <b style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h3)" }}>{unitName} · {compartment}</b>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-mute)", cursor: "pointer", fontSize: "var(--t-small)" }}>Fermer</button>
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: "var(--t-small)", color: "var(--ink-mute)", marginTop: "var(--s-2)" }}>Compartiment vide.</p>
      ) : (
        <ul style={{ listStyle: "none", display: "grid", gap: "var(--s-2)", marginTop: "var(--s-3)" }}>
          {rows.map((r) => (
            <li key={r.itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--t-small)" }}>
              <span>{label(r)} <b>×{r.quantity}</b></span>
              <form action={unplaceAction}>
                <input type="hidden" name="placementId" value={r.placementId} />
                <button style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "2px 10px", fontSize: "var(--t-meta)", color: "var(--warn)", cursor: "pointer" }}>Retirer</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {placeable.length > 0 && (
        <form action={placeBottlesAction} style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)", marginTop: "var(--s-3)", alignItems: "center" }}>
          <input type="hidden" name="unitId" value={unitId} />
          <input type="hidden" name="compartment" value={compartment} />
          <select name="cellarItemId" required style={sel}>
            {placeable.map((t) => <option key={t.itemId} value={t.itemId}>{t.producer}{t.vintage ? ` ${t.vintage}` : ""} (×{t.unplaced})</option>)}
          </select>
          <input name="quantity" type="number" min={1} defaultValue={1} style={{ ...sel, width: 64 }} />
          <button style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "var(--s-2) var(--s-4)", cursor: "pointer", fontSize: "var(--t-small)" }}>Déposer ici</button>
        </form>
      )}
    </div>
  );
}

const sel: React.CSSProperties = { padding: "var(--s-2) var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)" };
```

> The "Retirer" form posts the real `r.placementId` (carried by `caveContents` and `ContentRow`, both defined in Tasks 2–3) to `unplaceAction`; the "Déposer" form posts the selected compartment's fixed `unitId`/`compartment` + a chosen tray item — so there is no reactive-compartment-select problem here (the spec §14b concern was specific to the edit page).

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. (`placeBottlesAction`/`unplaceAction` imported into this client component is the same server-action-in-client pattern the Plan A build already validated.)

- [ ] **Step 3: Commit**

```bash
git add src/app/cave/CaveBoard.tsx
git commit -m "feat(cave): CaveBoard SVG component + tray"
```

---

## Task 5: The /cave page

**Files:**
- Create: `src/app/cave/page.tsx`

- [ ] **Step 1: Create the page `src/app/cave/page.tsx`**

```tsx
import { requireUserId } from "@/auth/require-user";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { wines } from "@/db/schema";
import { listUnits, unplacedTray, caveContents, locateWinePlacements } from "@/cave/queries";
import { highlightSet } from "@/cave/group";
import { CaveBoard, type BoardUnit, type TrayItem } from "./CaveBoard";

export default async function CavePage({ searchParams }: { searchParams: Promise<{ wine?: string }> }) {
  const userId = await requireUserId();
  const sp = await searchParams;

  const [units, tray, contents] = await Promise.all([
    listUnits(userId),
    unplacedTray(userId),
    caveContents(userId),
  ]);

  const boardUnits: BoardUnit[] = units.map((u) => ({ id: u.id, name: u.name, kind: u.kind, cols: u.cols, rows: u.rows, gridX: u.gridX, gridY: u.gridY }));
  const trayItems: TrayItem[] = tray.map((t) => ({ itemId: t.itemId, producer: t.producer, cuvee: t.cuvee, vintage: t.vintage, color: t.color, unplaced: t.unplaced }));

  let highlight: string[] = [];
  let locate: { wineLabel: string } | null = null;
  if (sp.wine) {
    const placements = await locateWinePlacements(userId, sp.wine);
    highlight = [...highlightSet(placements)];
    const w = (await db.select({ producer: wines.producer, cuvee: wines.cuvee, vintage: wines.vintage }).from(wines).where(eq(wines.id, sp.wine)).limit(1))[0];
    if (w) locate = { wineLabel: `${w.producer}${w.cuvee ? " · " + w.cuvee : ""}${w.vintage ? " " + w.vintage : ""}` };
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>Ma cave</h1>
        <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "baseline" }}>
          <a href="/cave/setup" style={{ fontSize: "var(--t-small)" }}>Configurer</a>
          <a href="/cellar" style={{ fontSize: "var(--t-small)" }}>Liste</a>
        </div>
      </header>

      {boardUnits.length === 0 ? (
        <div style={{ marginTop: "var(--s-8)", textAlign: "center", padding: "var(--s-8)", border: "1px dashed var(--line)", borderRadius: "var(--radius-lg)", background: "var(--card)" }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h2)" }}>Cave vide</p>
          <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginTop: "var(--s-2)" }}><a href="/cave/setup">Configure tes cubes</a> pour commencer.</p>
        </div>
      ) : (
        <div style={{ marginTop: "var(--s-5)" }}>
          <CaveBoard units={boardUnits} contents={contents} tray={trayItems} highlight={highlight} locate={locate} />
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify — type-check, build, test**

Run: `pnpm exec tsc --noEmit` (no new errors), then `pnpm build` (succeeds; `/cave` appears in the route list), then `pnpm test` (still green).

- [ ] **Step 3: Commit**

```bash
git add src/app/cave/page.tsx
git commit -m "feat(cave): /cave isometric view — board, tray, place/remove in-view"
```

- [ ] **Step 4: CONTROLLER CHECKPOINT — eyeball the visual**

After this task, the controller should run the app against a dev DB (or a seeded fixture), open `/cave` with a couple of cubes + placed bottles, and screenshot it to confirm the isometric look reads well (cube extrusion, compartment fills, counts, tray) before building locate polish. Tune `CUBE`/`GAP`/`DEPTH_X`/`DEPTH_Y` in `src/cave/iso.ts` if needed (constants only; geometry tests use them symbolically so they won't break).

---

## Task 6: Locate links from the cellar list + wine detail

**Files:**
- Modify: `src/app/cellar/page.tsx`
- Modify: `src/app/wine/[id]/page.tsx`

- [ ] **Step 1: Point "Ma cave (3D)" to the view + add a per-row Localiser link**

In `src/app/cellar/page.tsx`, change the header link `href="/cave/setup"` to `href="/cave"` (the view is now the primary entry; the view links to `/cave/setup` for configuration).

Then, in the per-row actions `<div>` (which contains "Éditer", the "Bue −1" form, and "Suppr."), add before "Éditer":

```tsx
                  <a href={`/cave?wine=${b.wineId}`} style={{ fontSize: "var(--t-meta)", color: "var(--accent-deep)" }}>Localiser</a>
```

- [ ] **Step 2: Add a Localiser link on the wine detail page**

Read `src/app/wine/[id]/page.tsx`. It renders a wine with the user's bottles. Near the top actions/header of that page (wherever links like edit/back live), add:

```tsx
      <a href={`/cave?wine=${wine.id}`} style={{ fontSize: "var(--t-small)", color: "var(--accent-deep)" }}>Localiser dans ma cave</a>
```
(Use the actual variable holding the wine id on that page — it is `wine.id` from `getWineWithBottles`. If the page uses a different local name, adapt.)

- [ ] **Step 3: Verify + commit**

Run: `pnpm exec tsc --noEmit` (no new errors), `pnpm build` (succeeds).

```bash
git add src/app/cellar/page.tsx "src/app/wine/[id]/page.tsx"
git commit -m "feat(cave): Localiser links from cellar list + wine detail"
```

---

## Task 7: Harden the placement invariant (transaction + unique constraint)

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0005_*.sql` (generated)
- Modify: `src/cave/actions.ts`

Addresses spec §14b: a compartment must never hold duplicate rows for the same item, and the read-modify-write of `placeBottlesAction` must be atomic.

- [ ] **Step 1: Add a unique constraint to `placements`**

In `src/db/schema.ts`, the `placements` table's second argument currently returns `{ byItem, byUnit }` indexes. Add a unique constraint (import `unique` is already present in the file). Change the callback to:

```ts
}, (t) => ({
  byItem: index("placements_item_idx").on(t.cellarItemId),
  byUnit: index("placements_unit_idx").on(t.unitId),
  uniqSlot: unique("uniq_placement_slot").on(t.cellarItemId, t.unitId, t.compartment),
}));
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: `drizzle/0005_*.sql` with `ALTER TABLE "placements" ADD CONSTRAINT "uniq_placement_slot" UNIQUE("cellar_item_id","unit_id","compartment")`.

- [ ] **Step 3: Wrap `placeBottlesAction`'s read-modify-write in a transaction**

In `src/cave/actions.ts`, `placeBottlesAction` currently does: validate → load item → load/validate unit → `canPlace` → find-or-insert/update. Wrap the load-guard-write portion in `db.transaction`. Replace the body AFTER `const unit = await getUnit(...)` guard with:

```ts
  await db.transaction(async (tx) => {
    const current = await tx
      .select({ id: placements.id, unitId: placements.unitId, compartment: placements.compartment, quantity: placements.quantity })
      .from(placements)
      .innerJoin(cellarItems, eq(placements.cellarItemId, cellarItems.id))
      .where(and(eq(placements.cellarItemId, d.cellarItemId), eq(cellarItems.userId, userId)))
      .orderBy(placements.createdAt);
    if (!canPlace(item.quantity, current, d.quantity)) return;
    const same = current.find((p) => p.unitId === d.unitId && p.compartment === d.compartment);
    if (same) {
      await tx.update(placements).set({ quantity: same.quantity + d.quantity }).where(eq(placements.id, same.id));
    } else {
      await tx.insert(placements).values({ cellarItemId: d.cellarItemId, unitId: d.unitId, compartment: d.compartment, quantity: d.quantity });
    }
  });
  revalidatePath("/cave/setup");
  revalidatePath("/cave");
```
Remove the now-duplicated non-transactional `current`/`canPlace`/`same`/insert-update block that followed the unit guard (it is fully replaced by the transaction above). Keep the earlier `listPlacementsForItem` import only if still used elsewhere in the file (it is used by `reconcileItemPlacements`), so leave the import.

- [ ] **Step 4: Verify + commit**

Run: `pnpm exec tsc --noEmit` (no new errors), `pnpm test` (green), `pnpm build` (succeeds).

```bash
git add src/db/schema.ts drizzle/ src/cave/actions.ts
git commit -m "feat(cave): unique compartment-slot constraint + transactional place"
```

---

## Task 8: Full verification

- [ ] **Step 1: Test suite** — Run: `pnpm test` — all green (Plan A tests + `cave-iso`, `cave-group`).
- [ ] **Step 2: Type-check** — Run: `pnpm exec tsc --noEmit` — no new errors beyond the pre-existing tests/ai-*.test.ts baseline.
- [ ] **Step 3: Build** — Run: `pnpm build` — succeeds; `/cave` present in the route list.
- [ ] **Step 4: Manual smoke (dev DB, migrations 0004+0005 applied)** —
  1. `/cave/setup` → add a diamond cube (gridX 0, gridY 0) and a grid 4×4 (gridX 1, gridY 0).
  2. `/cave` → both cubes render in 2.5D; tray shows unplaced bottles.
  3. Click a compartment → panel opens → "Déposer ici" a tray bottle → it appears with a count; tray decrements.
  4. From `/cellar`, click "Localiser" on that wine → `/cave?wine=…` dims the board and pulses its compartment(s), banner shows the wine.
  5. "Retirer" from the panel → bottle returns to the tray.

- [ ] **Step 5: Final commit (if smoke fixes)** — `git add -A && git commit -m "fix(cave): Plan B smoke fixes" || echo "nothing to commit"`

---

## Done when

- `/cave` renders the user's cubes isometrically with per-compartment bottle counts, an "À ranger" tray, and in-view place/remove.
- "Localiser" from the cellar list or wine detail dims the board and pulses the compartment(s) holding that wine, with a banner.
- Placement is atomic and a compartment can't hold duplicate rows for one item (migration 0005).
- All pure geometry/grouping is unit-tested; `pnpm test`, `tsc`, and `build` are green.
- **Layer 3 (3D cellar) complete.** Remaining app work: Phase 4 (automatic price tracking).

## Out of scope / deferred (unchanged from spec)

- Drag-and-drop placement; true WebGL; free camera rotation; the keepsake wooden box; dropping the obsolete `cellar_items.location` column; per-compartment capacity enforcement (counts are shown, not capped).
