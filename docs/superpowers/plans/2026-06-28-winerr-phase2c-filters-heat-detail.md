# Winerr Phase 2C — Filters/Sorts + Drink-Window Heat + Wine Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cellar browsable — filter by color/region/drink-window-status/in-cellar-or-drunk and sort by name/vintage/drink-before/recent/price — render each bottle's drinking window as a coloured "heat" badge (the design system's z1→z5 scale), and add a wine-detail page.

**Architecture:** Pure functions compute a bottle's drink-window status+colour and apply the filter/sort over the in-memory bottle list (a personal cellar is small; in-JS is simple and unit-testable). `listCellar` is widened to return both in-cellar and drunk bottles; the cellar page reads filter/sort from `searchParams`, applies the pure helpers, and renders controls + heat badges + per-wine links. A new `/wine/[id]` page reuses the existing `getWineWithBottles`.

**Tech Stack:** Next.js 16 (App Router, server components + searchParams), Drizzle, Vitest.

**Builds on:** Phase 2A/2B. Relevant existing: `src/cellar/queries.ts` (`listCellar` returns rows with `itemId, quantity, purchasePrice, purchaseDate, status, wineId, producer, cuvee, vintage, region, color, drinkFrom, drinkTo`; `getWineWithBottles(userId, wineId)` returns `{ wine, bottles }`), `src/app/cellar/page.tsx`, `src/app/globals.css` (z1–z5 tokens: `--z1:#b9c6b3 --z2:#6b8e65 --z3:#e89178 --z4:#d85b3d --z5:#b84527`).

---

## File Structure

```
src/
├── cellar/
│   ├── drink-status.ts     # pure: drinkStatus(from,to,year) → {key,label,color}
│   ├── filters.ts          # pure: filterAndSort(bottles, params), filterOptions(bottles)
│   └── queries.ts          # MODIFY: listCellar returns all statuses; export CellarRow type
└── app/
    ├── cellar/page.tsx      # MODIFY: filter/sort controls + heat badges + wine links
    └── wine/[id]/page.tsx   # NEW: wine detail (catalog + window + my bottles)
tests/
├── drink-status.test.ts
└── cellar-filters.test.ts
```

---

## Task 1: Drink-window status (TDD)

**Files:**
- Create: `src/cellar/drink-status.ts`
- Test: `tests/drink-status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/drink-status.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { drinkStatus } from "@/cellar/drink-status";

describe("drinkStatus", () => {
  it("returns null when no window", () => {
    expect(drinkStatus(null, null, 2026)).toBeNull();
    expect(drinkStatus(2026, null, 2026)).toBeNull();
  });
  it("is 'young' before the window opens", () => {
    const s = drinkStatus(2030, 2040, 2026)!;
    expect(s.key).toBe("young");
    expect(s.label).toContain("Trop jeune");
    expect(s.color).toBe("var(--z1)");
  });
  it("is 'ready' inside the window, comfortably before the end", () => {
    const s = drinkStatus(2024, 2034, 2026)!;
    expect(s.key).toBe("ready");
    expect(s.color).toBe("var(--z2)");
  });
  it("is 'soon' within the last two years of the window", () => {
    const s = drinkStatus(2018, 2027, 2026)!;
    expect(s.key).toBe("soon");
    expect(s.label).toContain("2027");
    expect(s.color).toBe("var(--z4)");
  });
  it("is 'past' after the window closes", () => {
    const s = drinkStatus(2010, 2020, 2026)!;
    expect(s.key).toBe("past");
    expect(s.color).toBe("var(--z5)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/drink-status.test.ts`
Expected: FAIL — cannot resolve `@/cellar/drink-status`.

- [ ] **Step 3: Write minimal implementation**

Create `src/cellar/drink-status.ts`:
```ts
export type DrinkStatus = {
  key: "young" | "ready" | "soon" | "past";
  label: string;
  color: string; // a CSS var() from the z1..z5 heat scale
};

// Maps a wine's estimated window against the current year to a status + heat
// colour. Returns null when the window is incomplete.
export function drinkStatus(
  from: number | null,
  to: number | null,
  currentYear: number,
): DrinkStatus | null {
  if (from == null || to == null) return null;
  if (currentYear < from) {
    return { key: "young", label: `Trop jeune (dès ${from})`, color: "var(--z1)" };
  }
  if (currentYear > to) {
    return { key: "past", label: `À boire (apogée passée ${to})`, color: "var(--z5)" };
  }
  if (currentYear >= to - 1) {
    return { key: "soon", label: `À boire avant ${to}`, color: "var(--z4)" };
  }
  return { key: "ready", label: `À boire (${from}–${to})`, color: "var(--z2)" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/drink-status.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cellar/drink-status.ts tests/drink-status.test.ts
git commit -m "feat(cellar): add drink-window status + heat colour helper"
```

---

## Task 2: Filter & sort (TDD)

**Files:**
- Create: `src/cellar/filters.ts`
- Test: `tests/cellar-filters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/cellar-filters.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { filterAndSort, filterOptions, type CellarBottle } from "@/cellar/filters";

const rows: CellarBottle[] = [
  { itemId: "1", producer: "Alpha", cuvee: null, vintage: 2015, region: "Bordeaux", color: "rouge", quantity: 2, purchasePrice: "30.00", status: "in_cellar", drinkFrom: 2020, drinkTo: 2030, wineId: "wA", purchaseDate: "2024-01-01" },
  { itemId: "2", producer: "Beta", cuvee: null, vintage: 2019, region: "Bourgogne", color: "blanc", quantity: 1, purchasePrice: "12.00", status: "in_cellar", drinkFrom: null, drinkTo: null, wineId: "wB", purchaseDate: "2024-02-01" },
  { itemId: "3", producer: "Gamma", cuvee: null, vintage: 2012, region: "Bordeaux", color: "rouge", quantity: 0, purchasePrice: null, status: "drunk", drinkFrom: 2015, drinkTo: 2022, wineId: "wC", purchaseDate: "2023-01-01" },
];

describe("filterAndSort", () => {
  it("defaults to in-cellar only", () => {
    const r = filterAndSort(rows, {});
    expect(r.map((b) => b.itemId)).toEqual(["1", "2"]);
  });
  it("filters by color", () => {
    expect(filterAndSort(rows, { color: "blanc" }).map((b) => b.itemId)).toEqual(["2"]);
  });
  it("filters by region", () => {
    expect(filterAndSort(rows, { region: "Bordeaux" }).map((b) => b.itemId)).toEqual(["1"]);
  });
  it("shows drunk when status=drunk", () => {
    expect(filterAndSort(rows, { status: "drunk" }).map((b) => b.itemId)).toEqual(["3"]);
  });
  it("sorts by vintage ascending", () => {
    expect(filterAndSort(rows, { sort: "vintage" }).map((b) => b.vintage)).toEqual([2015, 2019]);
  });
  it("sorts by price descending", () => {
    expect(filterAndSort(rows, { sort: "price" }).map((b) => b.itemId)).toEqual(["1", "2"]);
  });
});

describe("filterOptions", () => {
  it("returns the distinct regions and colors across all rows", () => {
    const o = filterOptions(rows);
    expect(o.regions.sort()).toEqual(["Bordeaux", "Bourgogne"]);
    expect(o.colors.sort()).toEqual(["blanc", "rouge"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/cellar-filters.test.ts`
Expected: FAIL — cannot resolve `@/cellar/filters`.

- [ ] **Step 3: Write minimal implementation**

Create `src/cellar/filters.ts`:
```ts
export type CellarBottle = {
  itemId: string;
  producer: string | null;
  cuvee: string | null;
  vintage: number | null;
  region: string | null;
  color: string | null;
  quantity: number;
  purchasePrice: string | null;
  status: "in_cellar" | "drunk";
  drinkFrom: number | null;
  drinkTo: number | null;
  wineId: string;
  purchaseDate: string | null;
};

export type CellarParams = {
  color?: string;
  region?: string;
  status?: "in_cellar" | "drunk";
  sort?: "name" | "vintage" | "drink" | "recent" | "price";
};

// Pure filter + sort over the user's bottles. Defaults: in-cellar, newest-first.
export function filterAndSort(rows: CellarBottle[], params: CellarParams): CellarBottle[] {
  const status = params.status ?? "in_cellar";
  let out = rows.filter((b) => b.status === status);
  if (params.color) out = out.filter((b) => b.color === params.color);
  if (params.region) out = out.filter((b) => b.region === params.region);

  const sort = params.sort ?? "recent";
  const cmp: Record<string, (a: CellarBottle, b: CellarBottle) => number> = {
    name: (a, b) => (a.producer ?? "").localeCompare(b.producer ?? ""),
    vintage: (a, b) => (a.vintage ?? 0) - (b.vintage ?? 0),
    drink: (a, b) => (a.drinkTo ?? 9999) - (b.drinkTo ?? 9999),
    price: (a, b) => Number(b.purchasePrice ?? 0) - Number(a.purchasePrice ?? 0),
    recent: (a, b) => (b.purchaseDate ?? "").localeCompare(a.purchaseDate ?? ""),
  };
  return [...out].sort(cmp[sort] ?? cmp.recent);
}

// Distinct filterable values present in the user's bottles.
export function filterOptions(rows: CellarBottle[]): { regions: string[]; colors: string[] } {
  const regions = new Set<string>();
  const colors = new Set<string>();
  for (const b of rows) {
    if (b.region) regions.add(b.region);
    if (b.color) colors.add(b.color);
  }
  return { regions: [...regions], colors: [...colors] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/cellar-filters.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cellar/filters.ts tests/cellar-filters.test.ts
git commit -m "feat(cellar): add pure filter + sort over bottles"
```

---

## Task 3: Widen `listCellar` to all statuses

**Files:**
- Modify: `src/cellar/queries.ts`

- [ ] **Step 1: Return both in-cellar and drunk bottles**

In `src/cellar/queries.ts`, the `listCellar` function currently filters `and(eq(cellarItems.userId, userId), eq(cellarItems.status, "in_cellar"))`. Change the `.where(...)` to scope by user only:
```ts
    .where(eq(cellarItems.userId, userId))
```
(Remove the `and(...)` wrapper and the `eq(cellarItems.status, "in_cellar")` term — keep the `eq(cellarItems.userId, userId)`. If `and` is now unused in the file, leave the import; it is still used by `getWineWithBottles`.)

- [ ] **Step 2: Verify build & tests**

Run: `pnpm build && pnpm test`
Expected: build succeeds; all tests pass (the cellar-filters test exercises the in-cellar default in JS, so widening the query is safe).

- [ ] **Step 3: Commit**

```bash
git add src/cellar/queries.ts
git commit -m "feat(cellar): listCellar returns all statuses (filter in app layer)"
```

---

## Task 4: Cellar page — controls, heat badges, wine links

**Files:**
- Modify: `src/app/cellar/page.tsx`

- [ ] **Step 1: Rewrite the cellar page with filters/sorts + heat**

Replace `src/app/cellar/page.tsx` ENTIRELY with:
```tsx
import { auth, signOut } from "@/auth/config";
import { redirect } from "next/navigation";
import { listCellar } from "@/cellar/queries";
import { deleteBottleAction, markDrunkAction } from "@/cellar/actions";
import { filterAndSort, filterOptions, type CellarParams } from "@/cellar/filters";
import { drinkStatus } from "@/cellar/drink-status";

export default async function CellarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const sp = await searchParams;
  const params: CellarParams = {
    color: sp.color || undefined,
    region: sp.region || undefined,
    status: sp.status === "drunk" ? "drunk" : "in_cellar",
    sort: (sp.sort as CellarParams["sort"]) || "recent",
  };

  const all = await listCellar(session.user.id);
  const bottles = filterAndSort(all, params);
  const options = filterOptions(all);
  const year = new Date().getFullYear();

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>Ma cave</h1>
        <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "baseline" }}>
          <a href="/cellar/add" style={{ fontSize: "var(--t-small)" }}>+ Ajouter</a>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button style={{ background: "none", border: "none", color: "var(--ink-mute)", cursor: "pointer", fontSize: "var(--t-small)" }}>Déconnexion</button>
          </form>
        </div>
      </header>

      <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)", marginTop: "var(--s-5)" }}>
        <select name="status" defaultValue={params.status} style={ctrl}>
          <option value="in_cellar">En cave</option>
          <option value="drunk">Bues</option>
        </select>
        <select name="color" defaultValue={params.color ?? ""} style={ctrl}>
          <option value="">Toutes couleurs</option>
          {options.colors.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="region" defaultValue={params.region ?? ""} style={ctrl}>
          <option value="">Toutes régions</option>
          {options.regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select name="sort" defaultValue={params.sort} style={ctrl}>
          <option value="recent">Récents</option>
          <option value="name">Nom</option>
          <option value="vintage">Millésime</option>
          <option value="drink">À boire avant</option>
          <option value="price">Prix</option>
        </select>
        <button style={{ ...ctrl, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" }}>Filtrer</button>
      </form>

      {bottles.length === 0 ? (
        <div style={{ marginTop: "var(--s-8)", textAlign: "center", padding: "var(--s-8)", border: "1px dashed var(--line)", borderRadius: "var(--radius-lg)", background: "var(--card)" }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h2)" }}>Aucune bouteille</p>
          <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginTop: "var(--s-2)" }}>
            <a href="/cellar/add">Ajoute une bouteille</a>.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", marginTop: "var(--s-5)", display: "grid", gap: "var(--s-3)" }}>
          {bottles.map((b) => {
            const ds = drinkStatus(b.drinkFrom, b.drinkTo, year);
            return (
              <li key={b.itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--s-4)", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
                <div>
                  <a href={`/wine/${b.wineId}`} style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h3)", color: "var(--ink)" }}>
                    {b.producer}{b.cuvee ? ` · ${b.cuvee}` : ""}{b.vintage ? ` ${b.vintage}` : ""}
                  </a>
                  <div style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)" }}>
                    {b.region ?? "—"} · {b.color ?? "—"} · ×{b.quantity}
                    {b.purchasePrice ? ` · ${b.purchasePrice} €` : ""}
                  </div>
                  {ds && (
                    <span style={{ display: "inline-block", marginTop: 4, fontSize: "var(--t-meta)", color: "#fff", background: ds.color, padding: "2px 8px", borderRadius: "var(--radius-pill)" }}>
                      {ds.label}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "var(--s-3)", alignItems: "center" }}>
                  {b.status === "in_cellar" && (
                    <form action={markDrunkAction}>
                      <input type="hidden" name="itemId" value={b.itemId} />
                      <button style={miniBtn}>Bue −1</button>
                    </form>
                  )}
                  <form action={deleteBottleAction}>
                    <input type="hidden" name="itemId" value={b.itemId} />
                    <button style={{ ...miniBtn, color: "var(--warn)" }}>Suppr.</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

const ctrl: React.CSSProperties = { padding: "var(--s-2) var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)" };
const miniBtn: React.CSSProperties = { background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "var(--s-1) var(--s-3)", fontSize: "var(--t-meta)", cursor: "pointer", color: "var(--ink-soft)" };
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: succeeds; `/cellar` is a dynamic route (reads searchParams).

- [ ] **Step 3: Commit**

```bash
git add src/app/cellar/page.tsx
git commit -m "feat(cellar): filters, sorts, drink-window heat badges, wine links"
```

---

## Task 5: Wine-detail page

**Files:**
- Create: `src/app/wine/[id]/page.tsx`

- [ ] **Step 1: Write the wine-detail page**

Create `src/app/wine/[id]/page.tsx`:
```tsx
import { auth } from "@/auth/config";
import { redirect, notFound } from "next/navigation";
import { getWineWithBottles } from "@/cellar/queries";
import { drinkStatus } from "@/cellar/drink-status";

export default async function WinePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;
  const data = await getWineWithBottles(session.user.id, id);
  if (!data) notFound();
  const { wine, bottles } = data;
  const ds = drinkStatus(wine.drinkFrom, wine.drinkTo, new Date().getFullYear());

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <a href="/cellar" style={{ fontSize: "var(--t-small)" }}>← Ma cave</a>
      <h1 style={{ fontSize: "var(--t-h1)", marginTop: "var(--s-3)" }}>
        {wine.producer}{wine.cuvee ? ` · ${wine.cuvee}` : ""}
      </h1>
      <p style={{ color: "var(--ink-mute)", marginTop: "var(--s-2)" }}>
        {wine.vintage ?? "—"} · {wine.region ?? "—"} · {wine.color ?? "—"}
        {wine.grapes ? ` · ${wine.grapes}` : ""}
      </p>

      <div style={{ marginTop: "var(--s-5)", padding: "var(--s-5)", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
        <div style={{ fontSize: "var(--t-kicker)", textTransform: "uppercase", letterSpacing: 1.5, color: "var(--ink-mute)" }}>Fenêtre de dégustation</div>
        {ds ? (
          <div style={{ marginTop: "var(--s-2)" }}>
            <span style={{ fontSize: "var(--t-meta)", color: "#fff", background: ds.color, padding: "2px 8px", borderRadius: "var(--radius-pill)" }}>{ds.label}</span>
            {wine.drinkWindowConfidence && (
              <span style={{ color: "var(--ink-mute)", fontSize: "var(--t-meta)", marginLeft: "var(--s-2)" }}>
                confiance {Math.round(Number(wine.drinkWindowConfidence) * 100)} %
              </span>
            )}
          </div>
        ) : (
          <div style={{ marginTop: "var(--s-2)", color: "var(--ink-mute)", fontSize: "var(--t-small)" }}>—</div>
        )}
      </div>

      <h2 style={{ fontSize: "var(--t-h3)", marginTop: "var(--s-6)" }}>Mes bouteilles</h2>
      <ul style={{ listStyle: "none", marginTop: "var(--s-3)", display: "grid", gap: "var(--s-2)" }}>
        {bottles.map((b) => (
          <li key={b.id} style={{ padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)", color: "var(--ink-soft)" }}>
            ×{b.quantity} · {b.status === "drunk" ? "bue" : "en cave"}
            {b.purchasePrice ? ` · ${b.purchasePrice} €` : ""}
            {b.purchaseDate ? ` · acheté le ${b.purchaseDate}` : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Verify build & tests**

Run: `pnpm build && pnpm test`
Expected: build succeeds (new `/wine/[id]` dynamic route); all tests pass.

- [ ] **Step 3: Commit**

```bash
git add "src/app/wine"
git commit -m "feat(wine): add wine-detail page (catalog + window + my bottles)"
```

---

## Self-Review Notes

- **Spec coverage (2C portion):** drink-window heat display with status buckets (Tasks 1,4); filters color/region/status (Tasks 2,3,4); sorts name/vintage/drink-before/recent/price (Task 2,4); wine-detail page (Task 5) using the previously-unused `getWineWithBottles`. This completes the Phase 2 spec's cellar-view section.
- **No placeholders:** every step ships concrete code/commands. Filtering/sorting is in-app over `listCellar` results (a personal cellar is small) — pure and unit-tested.
- **Type consistency:** `CellarBottle` (Task 2) matches the `listCellar` row shape (Phase 2A queries, used in Task 4). `drinkStatus` (Task 1) is consumed by the cellar page (Task 4) and wine page (Task 5). `CellarParams` flows from `searchParams` (Task 4) into `filterAndSort` (Task 2). The `getWineWithBottles` return shape (`{ wine, bottles }`, `wine.drinkWindowConfidence` numeric→string) is used in Task 5.
- **Known follow-ups:** the in-app filter/sort is fine for a personal cellar but would move to the DB at large scale; a "drink-window status" filter (young/ready/soon/past) could be added to `CellarParams` later; reviews & ratings (Phase 3) are out of scope.
