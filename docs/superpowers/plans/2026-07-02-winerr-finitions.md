# Finitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear every worthwhile deferred item: fully green tsc/lint baseline, robustness fixes (AUTH_SECRET, uniq_wine, local dates, quote seed), a11y/UX polish, the proxy rename, and the drink-window filter.

**Architecture:** Four independent batches of small fixes on existing files, plus one micro-feature (window filter) with pure TDD logic in `src/cellar/filters.ts`. One migration (0006). After Batch 1, the verification baseline becomes **zero** tsc errors and **zero** lint errors/warnings — every later batch must keep it that way.

**Tech Stack:** unchanged (Next 16, Drizzle/PG16, Zod, Vitest).

**Reference:** spec `docs/superpowers/specs/2026-07-02-winerr-finitions-design.md`.

---

## Baseline notes for every task
- Work from `/Users/nathanmercier/Documents/Project/frontend/winerr` on branch `finitions` (controller creates it). Commit signing DISABLED locally — plain `git commit`.
- Until Batch 1 lands: ~15 tsc errors in `tests/ai-*.test.ts` and 4 lint errors + 2 warnings exist. **After Batch 1: `pnpm exec tsc --noEmit` and `pnpm lint` must be 100 % clean and stay clean.**
- Current test count: 137. `@` → `src`.

---

## Batch 1 — Code hygiene

### Task 1.1: tsc green — type the fetch mocks

**Files:** Modify `tests/ai-gemini.test.ts`, `tests/ai-mistral.test.ts`, `tests/ai-tavily.test.ts`

The errors (TS2352/TS2493) all come from untyped `vi.fn(async () => ...)` fakes: their `mock.calls` infer as `[]` tuples, so `mock.calls[0][0] as string` fails. Fix by giving every fake fetch an explicit fetch-shaped signature, then dropping the now-invalid casts:

- [ ] **Step 1:** In each file, change the fake-fetch helpers from `vi.fn(async () => ...)` to:
```ts
vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ({ ok, status, json: async () => payload }) as unknown as Response)
```
(keep each file's exact payload/ok/status logic — only the parameter signature changes). Where a test reads `fetchFn.mock.calls[0][0]` / `[0][1]`, the values are now typed `string | URL | Request` / `RequestInit | undefined`; adjust reads to e.g. `String(fetchFn.mock.calls[0][0])` and `fetchFn.mock.calls[0][1]!` (non-null after asserting the call happened) instead of `as string` / `as RequestInit` casts. Do NOT weaken any assertion.
- [ ] **Step 2:** Run `pnpm exec tsc --noEmit` → expect **ZERO errors anywhere**. Run `pnpm test` → 137 green (behavior unchanged).
- [ ] **Step 3:** Commit: `git add tests/ && git commit -m "test: type the fetch mocks — tsc fully green"`

### Task 1.2: lint green — apostrophes + img pragmas

**Files:** Modify `src/app/(auth)/login/page.tsx`, `src/app/cellar/add/page.tsx`, `src/app/cellar/page.tsx`, `src/app/wine/[id]/page.tsx`

- [ ] **Step 1:** Run `pnpm lint` to get exact positions. Replace the 4 unescaped `'` in JSX text (login:36, add:223/227×2) with the typographic `’` (codebase convention).
- [ ] **Step 2:** Above each of the two `<img` elements (cellar list row thumbnail, wine detail image), add:
```tsx
{/* eslint-disable-next-line @next/next/no-img-element -- tiny DB-served thumbnail; no image optimizer on self-host */}
```
- [ ] **Step 3:** `pnpm lint` → **exit 0, zero problems**. `pnpm build` still succeeds.
- [ ] **Step 4:** Commit: `git add -A && git commit -m "chore: lint fully green (apostrophes + justified img pragmas)"`

### Task 1.3: dedupe requireUserId + atomic markDrunk

**Files:** Modify `src/cellar/actions.ts`, `src/reviews/actions.ts`

- [ ] **Step 1:** In BOTH files: delete the local `async function requireUserId()` definition and its now-unused imports if any (`auth` stays only if still used elsewhere in the file — in reviews/actions.ts check; in cellar/actions.ts `auth` is NOT used elsewhere → remove that import too), and add `import { requireUserId } from "@/auth/require-user";`. Behavior is identical (same redirect("/login")).
- [ ] **Step 2:** In `src/cellar/actions.ts` `markDrunkAction`, replace the TWO sequential updates with ONE atomic statement:
```ts
  await db
    .update(cellarItems)
    .set({
      quantity: sql`greatest(${cellarItems.quantity} - 1, 0)`,
      status: sql`CASE WHEN ${cellarItems.quantity} - 1 <= 0 THEN 'drunk'::cellar_status ELSE ${cellarItems.status} END`,
    })
    .where(and(eq(cellarItems.id, itemId), eq(cellarItems.userId, userId)));
```
(the `sql` import already exists in the file; keep `await reconcileItemPlacements(...)` + revalidates after).
- [ ] **Step 3:** `pnpm exec tsc --noEmit` (0 errors), `pnpm test` (green), `pnpm lint` (clean).
- [ ] **Step 4:** Commit: `git add src/cellar/actions.ts src/reviews/actions.ts && git commit -m "refactor: shared requireUserId + atomic markDrunk update"`

---

## Batch 2 — Robustness

### Task 2.1: AUTH_SECRET fail-fast

**Files:** Modify `src/auth/config.ts`

- [ ] **Step 1:** Read the file. At its top (module scope, right after imports — same idiom as `src/db/index.ts`'s DATABASE_URL check), add:
```ts
if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is not set");
```
- [ ] **Step 2:** `pnpm build` — must still pass (`@/auth/config` is only imported by server code on dynamic routes, same situation as `@/db`). If the build DOES fail on a statically-rendered page importing auth, report BLOCKED with the page — do not weaken to a console.warn silently.
- [ ] **Step 3:** `pnpm test` green. Commit: `git add src/auth/config.ts && git commit -m "feat(auth): fail fast when AUTH_SECRET is unset"`

### Task 2.2: uniq_wine NULLS NOT DISTINCT (migration 0006)

**Files:** Modify `src/db/schema.ts`; Create `drizzle/0006_*.sql` (generated)

- [ ] **Step 1:** In `src/db/schema.ts`, change the wines table constraint from
`uniqWine: unique("uniq_wine").on(t.producer, t.cuvee, t.vintage),` to
`uniqWine: unique("uniq_wine").on(t.producer, t.cuvee, t.vintage).nullsNotDistinct(),`
- [ ] **Step 2:** Run `pnpm db:generate` → expect `drizzle/0006_*.sql` containing a DROP of `uniq_wine` and an `ADD CONSTRAINT "uniq_wine" UNIQUE NULLS NOT DISTINCT("producer","cuvee","vintage")`. (Postgres is 16 — supported.) If drizzle-kit emits something else, report it verbatim.
- [ ] **Step 3:** Read `src/catalog/service.ts` `ensureWine`: confirm its 23505 catch re-queries the existing row by normalized match (it does — no change needed; note in your report HOW it resolves so the reviewer can double-check).
- [ ] **Step 4:** `pnpm exec tsc --noEmit` (0), `pnpm test` (green). Commit: `git add src/db/schema.ts drizzle/ && git commit -m "feat(catalog): uniq_wine NULLS NOT DISTINCT (migration 0006)"`

### Task 2.3: local purchase date (TDD)

**Files:** Create `src/lib/dates.ts`; Test `tests/dates.test.ts`; Modify `src/cellar/actions.ts`, `src/reviews/actions.ts`

- [ ] **Step 1:** Failing test `tests/dates.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { todayLocalISO } from "@/lib/dates";

describe("todayLocalISO", () => {
  it("formats the Paris-local day as YYYY-MM-DD", () => {
    // 23:30 UTC on Jan 1 is already Jan 2 in Paris (UTC+1 in winter)
    expect(todayLocalISO(new Date("2026-01-01T23:30:00Z"))).toBe("2026-01-02");
    // 00:30 UTC in summer (UTC+2) is the same calendar day in Paris
    expect(todayLocalISO(new Date("2026-07-02T00:30:00Z"))).toBe("2026-07-02");
    // and 22:30 UTC in summer is already the next Paris day
    expect(todayLocalISO(new Date("2026-07-02T22:30:00Z"))).toBe("2026-07-03");
  });
});
```
- [ ] **Step 2:** Run → FAIL (module missing).
- [ ] **Step 3:** Implement `src/lib/dates.ts`:
```ts
// The user's calendar day (Europe/Paris), as YYYY-MM-DD. fr-CA gives ISO order.
export function todayLocalISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(now);
}
```
- [ ] **Step 4:** Run → PASS. Then replace the two UTC-day call sites:
  - `src/cellar/actions.ts` `addBottleAction`: `purchaseDate: new Date().toISOString().slice(0, 10), // today` → `purchaseDate: todayLocalISO(),` (+ import).
  - `src/reviews/actions.ts`: the local `function today()` returns the UTC day; replace its body with `return todayLocalISO();` (+ import) or replace call sites and delete it.
- [ ] **Step 5:** `tsc` 0, `pnpm test` green, lint clean. Commit: `git add src/lib/dates.ts tests/dates.test.ts src/cellar/actions.ts src/reviews/actions.ts && git commit -m "fix: purchase/tasting dates use the Paris-local day"`

### Task 2.4: quote seed from enrichment (kills the double Tavily search)

**Files:** Modify `src/app/cellar/add/page.tsx` (client form part), `src/lib/validation.ts`, `src/cellar/actions.ts`

- [ ] **Step 1:** READ `src/app/cellar/add/page.tsx`. Locate where the enrichment result prefills the form (it sets the purchase-price input from `priceEur`). Add a **hidden input** `name="marketPriceEur"` populated from the enrichment's `priceEur` (empty string when absent). It must NOT be tied to the user-editable purchase field.
- [ ] **Step 2:** In `src/lib/validation.ts` `addBottleSchema`, add:
```ts
  marketPriceEur: z.preprocess(emptyToUndefined, z.coerce.number().min(0.5).max(10000).optional()),
```
- [ ] **Step 3:** In `addBottleAction` (src/cellar/actions.ts), BEFORE the `void refreshWinePrice(wineId);` line, add:
```ts
  // Seed a quote from the enrichment result so refreshWinePrice's staleness
  // gate skips a redundant Tavily+Mistral search seconds after the enrichment.
  if (d.marketPriceEur != null) {
    const { priceSnapshots } = await import("@/db/schema");
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
```
- [ ] **Step 4:** Verify the wine page renders a `web-enrich` snapshot like any other (it does — source is just displayed). `tsc` 0, `pnpm test` green, `pnpm build` OK. Commit: `git add src/app/cellar/add/page.tsx src/lib/validation.ts src/cellar/actions.ts && git commit -m "feat(price): seed the first quote from enrichment (single Tavily spend on add)"`

---

## Batch 3 — A11y & UX

### Task 3.1: StarRating keyboard

**Files:** Modify `src/components/StarRating.tsx`

- [ ] **Step 1:** Current component: outer `<span>` with per-star `<span onClick>` (mouse half-star: left half = i+0.5, right half = i+1). Make it keyboard-operable while preserving mouse behavior exactly. When `interactive`:
  - outer element gets `role="slider"`, `tabIndex={0}`, `aria-valuemin={0.5}`, `aria-valuemax={5}`, `aria-valuenow={value ?? 0}`, `aria-label={value != null ? `Note ${value} sur 5` : "Noter ce vin"}`;
  - `onKeyDown`: ArrowRight/ArrowUp → `onRate(snapRating((value ?? 0) + 0.5))`; ArrowLeft/ArrowDown → `onRate(snapRating((value ?? 0.5) - 0.5))`; both `e.preventDefault()`. Import `snapRating` from `@/reviews/rating`.
  - non-interactive render unchanged (keep the existing `aria-label`).
- [ ] **Step 2:** `tsc` 0, lint clean, `pnpm test` green, `pnpm build` OK. Commit: `git add src/components/StarRating.tsx && git commit -m "feat(a11y): keyboard-operable StarRating (slider semantics)"`

### Task 3.2: builder empty cells keyboard

**Files:** Modify `src/app/cave/setup/CellarBuilder.tsx`

- [ ] **Step 1:** The empty-cell `<div>` (the one with `onClick={() => { setAdding({ gridX: x, gridY: y }); setSelected(null); }}` and the `+` content) gets: `role="button"`, `tabIndex={0}`, `aria-label={`Ajouter un cube en colonne ${x + 1}, niveau ${y + 1}`}`, and `onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAdding({ gridX: x, gridY: y }); setSelected(null); } }}` — mirroring the occupied-tile pattern already in the file.
- [ ] **Step 2:** `tsc` 0, lint clean. Commit: `git add src/app/cave/setup/CellarBuilder.tsx && git commit -m "feat(a11y): keyboard-focusable empty cells in the cellar builder"`

### Task 3.3: auth forms a11y + next/link

**Files:** Modify `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx` (and `src/app/(auth)/_styles.ts` only if a label style is needed)

- [ ] **Step 1:** READ both pages. For each input: wrap in a `<label>` (visible text: Email / Mot de passe / Nom) following the label idiom used in `EditBottleForm.tsx` (`label` with grid gap). Add `autoComplete`: `email`; `current-password` (login) / `new-password` (register); `name` (register name field).
- [ ] **Step 2:** The error paragraph in each form gets `aria-live="polite"`.
- [ ] **Step 3:** The cross-links ("Créer un compte" / "Déjà un compte ? Se connecter") switch from `<a href>` to `next/link` `<Link href>`.
- [ ] **Step 4:** `tsc` 0, lint clean, `pnpm build` OK, manual glance at markup. Commit: `git add "src/app/(auth)/" && git commit -m "feat(a11y): labeled auth forms, autocomplete, live errors, next/link"`

### Task 3.4: add-search debounce + filter select labels

**Files:** Modify `src/app/cellar/add/page.tsx` (search client part), `src/app/cellar/page.tsx`

- [ ] **Step 1:** READ the add page's search component. It calls the search server action on input change. Debounce 300 ms: keep the raw query in state; in the change handler, `clearTimeout` a stored ref then `setTimeout(() => runSearch(q), 300)` (store the timer in `useRef<ReturnType<typeof setTimeout> | null>(null)`). Cancel pending timer when a result is picked. No behavioral change beyond call frequency.
- [ ] **Step 2:** In `src/app/cellar/page.tsx`, add `aria-label` to each filter `<select>`: `"Statut"`, `"Couleur"`, `"Région"`, `"Tri"` (and the window select added in Task 4.2 gets `"Fenêtre de dégustation"` there).
- [ ] **Step 3:** `tsc` 0, lint clean, build OK. Commit: `git add src/app/cellar/add/page.tsx src/app/cellar/page.tsx && git commit -m "feat(ux): debounced name search + labeled filter selects"`

---

## Batch 4 — Infra + window filter

### Task 4.1: middleware → proxy rename

**Files:** Rename `src/middleware.ts` → `src/proxy.ts`

- [ ] **Step 1:** `git mv src/middleware.ts src/proxy.ts` — content unchanged (the `auth(...)` default export + `config.matcher` stay identical). Consult `node_modules/next/dist/docs/` for the proxy file convention if anything is unclear (the default export name/config shape is the same).
- [ ] **Step 2:** `pnpm build` — MUST succeed AND no longer print the middleware deprecation warning. Confirm the build output shows the proxy (`ƒ Proxy` line). If Auth.js v5 beta fails under the proxy convention (build or type error), REVERT the rename and report BLOCKED with the exact error — do not force it.
- [ ] **Step 3:** `pnpm test` green. Commit: `git add -A && git commit -m "chore: middleware.ts → proxy.ts (Next 16 convention)"`

### Task 4.2: drink-window filter (TDD)

**Files:** Modify `src/cellar/filters.ts`; Test `tests/cellar-filters.test.ts`; Modify `src/app/cellar/page.tsx`

- [ ] **Step 1:** READ `src/cellar/filters.ts` and `tests/cellar-filters.test.ts` (existing suite). Add to the EXISTING test file a new describe:
```ts
describe("window filter", () => {
  const mk = (drinkFrom: number | null, drinkTo: number | null) => ({
    itemId: "i", quantity: 1, purchasePrice: null, purchaseDate: null, status: "in_cellar",
    wineId: "w", producer: "P", cuvee: null, vintage: null, region: null, color: null,
    drinkFrom, drinkTo, rating: null,
  });
  it("keeps only wines matching the window status", () => {
    const rows = [mk(2030, 2035), mk(2020, 2030), mk(2020, 2026), mk(2018, 2020)];
    const out = filterAndSort(rows as never, { status: "in_cellar", sort: "recent", window: "ready", currentYear: 2026 } as never);
    expect(out).toHaveLength(1);
    expect(out[0].drinkFrom).toBe(2020);
    expect(out[0].drinkTo).toBe(2030);
  });
  it("excludes windowless wines when a window filter is set, keeps them otherwise", () => {
    const rows = [mk(null, null), mk(2020, 2030)];
    expect(filterAndSort(rows as never, { status: "in_cellar", sort: "recent", window: "ready", currentYear: 2026 } as never)).toHaveLength(1);
    expect(filterAndSort(rows as never, { status: "in_cellar", sort: "recent" } as never)).toHaveLength(2);
  });
});
```
ADAPT the `mk` row shape to the file's actual `CellarBottle` type (read it first — the fields above are indicative; the test must construct valid `CellarBottle`s without `as never` if the type allows; use proper typing, dropping `as never` where possible).
- [ ] **Step 2:** Run → FAIL (window/currentYear unknown).
- [ ] **Step 3:** Implement in `src/cellar/filters.ts`:
  - `CellarParams` gains `window?: "young" | "ready" | "soon" | "past"; currentYear?: number;`
  - In `filterAndSort`, after the existing status/color/region filters:
```ts
  if (params.window) {
    const year = params.currentYear ?? new Date().getFullYear();
    rows = rows.filter((r) => drinkStatus(r.drinkFrom, r.drinkTo, year)?.key === params.window);
  }
```
(import `drinkStatus` from `./drink-status`; adapt to the function's local row variable name).
- [ ] **Step 4:** Run → PASS (full existing suite too).
- [ ] **Step 5:** Wire the page (`src/app/cellar/page.tsx`): parse `sp.window` into `params.window` (validate against the 4 keys, else undefined); add the select in the GET form (before the sort select):
```tsx
        <select name="window" defaultValue={params.window ?? ""} style={ctrl} aria-label="Fenêtre de dégustation">
          <option value="">Toutes fenêtres</option>
          <option value="ready">À l’apogée</option>
          <option value="soon">À boire vite</option>
          <option value="young">Trop jeune</option>
          <option value="past">Apogée passée</option>
        </select>
```
- [ ] **Step 6:** `tsc` 0, lint clean, `pnpm test` green, `pnpm build` OK. Commit: `git add src/cellar/filters.ts tests/cellar-filters.test.ts src/app/cellar/page.tsx && git commit -m "feat(cellar): filter by drink-window status (à l'apogée…)"`

---

## Task 5: Full verification

- [ ] `pnpm test` — all green (137 + new dates/filter tests).
- [ ] `pnpm exec tsc --noEmit` — **ZERO errors** (new baseline).
- [ ] `pnpm lint` — **exit 0, zero problems** (new baseline).
- [ ] `pnpm build` — succeeds, `ƒ Proxy` present, NO middleware deprecation warning.
- [ ] Manual smoke (dev DB): logged-out `/cellar` redirects to login (proxy works); login/register forms labeled + autocomplete; add a bottle with enrichment → ONE Tavily spend, snapshot `web-enrich` visible on the wine page; cellar window filter "À l'apogée" narrows the list; StarRating operable with arrows; builder "+" cells reachable by Tab.
- [ ] `git add -A && git commit -m "fix: finitions smoke fixes" || echo "nothing to commit"`

## Done when
tsc/lint/test/build all fully green with zero tolerated warnings; every spec item shipped or explicitly reverted-with-reason (proxy rename only). The deferred list is empty.
