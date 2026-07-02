# Winerr — Finitions (design)

**Date:** 2026-07-02
**Status:** Approved (scope validated item-by-item in brainstorm)
**Context:** The MVP is complete (all 3 features + the 3D cellar layer shipped). This batch clears every worthwhile deferred item from past reviews. No new subsystem — small, independent fixes grouped in 4 batches + one small feature (drink-window filter).

## Batch 1 — Code hygiene (zero behavior change)

| item | detail |
|---|---|
| **tsc 100 % green** | Fix the ~15 pre-existing errors in `tests/ai-gemini.test.ts`, `tests/ai-mistral.test.ts`, `tests/ai-tavily.test.ts` (fetch-mock typing: stubs assigned to `globalThis.fetch` don't satisfy the full `typeof fetch`). Type the stubs properly (cast helper `as unknown as typeof fetch` or a shared typed `fetchStub` helper) WITHOUT weakening what the tests assert. |
| **lint 100 % green** | Fix the 4 `react/no-unescaped-entities` errors (`src/app/(auth)/login/page.tsx:36`, `src/app/cellar/add/page.tsx:223,227×2`) with typographic apostrophes (`’`), matching the codebase convention. For the 2 `@next/next/no-img-element` warnings (`src/app/cellar/page.tsx`, `src/app/wine/[id]/page.tsx`): keep `<img>` (self-hosted standalone, images are tiny DB-served thumbnails; `next/image` optimization adds sharp/runtime cost for nothing) and add a one-line `{/* eslint-disable-next-line @next/next/no-img-element -- tiny DB-served thumbnail, no optimizer on self-host */}` above each. |
| **Dedupe `requireUserId`** | `src/cellar/actions.ts` and `src/reviews/actions.ts` each define a local copy; replace both with `import { requireUserId } from "@/auth/require-user";` (identical behavior — redirect("/login")). |
| **Atomic `markDrunkAction`** | Replace the two sequential UPDATEs with ONE atomic statement: decrement quantity (floor 0) and flip status to `drunk` when the new quantity is 0, e.g. `SET quantity = greatest(quantity-1,0), status = CASE WHEN quantity-1 <= 0 THEN 'drunk' ELSE status END`. The `reconcileItemPlacements` call stays after. |

## Batch 2 — Robustness

| item | detail |
|---|---|
| **`AUTH_SECRET` fail-fast** | At startup (in `src/auth/config.ts` where the secret is consumed), throw a clear error when `AUTH_SECRET` is unset — same idiom as `DATABASE_URL` in `src/db/index.ts`. Guarded so `pnpm build` (no env) still passes: throw at runtime init, not at module import in build contexts — follow how DATABASE_URL behaves today (it throws at import of `@/db`, which build tolerates because pages are dynamic; mirror that). |
| **`uniq_wine` NULLS NOT DISTINCT** | Postgres is 16 (compose.yaml) → migration 0006: drop `uniq_wine`, re-add as `UNIQUE NULLS NOT DISTINCT (producer, cuvee, vintage)`. Drizzle schema: `unique("uniq_wine").on(...).nullsNotDistinct()`. Prevents duplicate catalog rows for wines with NULL cuvee/vintage. `ensureWine` already handles 23505 (merge path) — verify that path still resolves the existing row on conflict. **PRE-DEPLOY:** before applying 0006 to the live DB, run `SELECT producer, cuvee, vintage, count(*) FROM wines GROUP BY 1,2,3 HAVING count(*) > 1;` — must return 0 rows (else merge the duplicates first). The query is also embedded as a comment at the top of `drizzle/0006_rainy_sphinx.sql`. |
| **`purchaseDate` local day** | `addBottleAction` stamps `new Date().toISOString().slice(0,10)` (UTC day). Replace with the server-local day via `new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date())` (fr-CA = YYYY-MM-DD) — a pure helper `todayLocalISO()` in `src/lib/dates.ts`, unit-tested with fixed instants. |
| **Quote seed from enrichment** | Kill the add-time double Tavily search (spec §8 of the Phase-4 design). The enrichment already extracts `priceEur`. Flow: `enrichWineAction` result already reaches the add page; the add form adds a hidden `marketPriceEur` input (set from enrichment `priceEur`, NOT the user-editable purchase field); `addBottleAction` reads it and, when present and the wine has NO snapshot yet, inserts a seed snapshot `{estimate, currency: "EUR", source: "web-enrich"}` BEFORE the `void refreshWinePrice(wineId)` call — whose staleness gate then skips the redundant search. When absent → unchanged behavior (refreshWinePrice searches). |

## Batch 3 — A11y & UX

| item | detail |
|---|---|
| **StarRating keyboard** | `src/components/StarRating.tsx`: make it focusable and operable — `role="slider"`-style or per-star buttons; Arrow Left/Right ±0.5 (clamped 0.5–5 via existing `snapRating`), Enter/submit applies; `aria-label` announcing the current value. Keep the mouse half-star behavior intact. |
| **Builder empty cells keyboard** | `src/app/cave/setup/CellarBuilder.tsx`: empty "+" cells get `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Space → open the add form), `aria-label` ("Ajouter un cube en colonne X, niveau Y"). |
| **Auth forms a11y** | `src/app/(auth)/login/page.tsx` + `register/page.tsx`: proper `<label>` per input (or `aria-label`), `autoComplete` hints (`email`, `current-password` / `new-password`, `name`), `aria-live="polite"` on the error paragraph, and cross-links (`login ↔ register`) via `next/link`. |
| **Search debounce** | The add-page name search fires per keystroke; debounce 300 ms in the client component that calls `searchWinesAction`. |
| **Filter select labels** | `src/app/cellar/page.tsx`: `aria-label` on the 4 filter `<select>`s (statut, couleur, région, tri) + the new window filter. |

## Batch 4 — Infra + the window filter

| item | detail |
|---|---|
| **`middleware.ts` → `proxy.ts`** | Next 16 deprecates the middleware file convention (build warning at every build). Rename `src/middleware.ts` → `src/proxy.ts` keeping the exact same `auth(...)` wrapper + `config.matcher`. Verify: `pnpm build` no longer prints the deprecation warning AND the redirect-to-login still works (protected `/cellar` when logged out). If Auth.js v5 beta breaks under the proxy convention, revert and document. |
| **Drink-window filter** (small feature) | User story: « filtrer les vins à l'apogée pour choisir quoi boire ce soir ». `src/cellar/filters.ts`: add `window?: "young" \| "ready" \| "soon" \| "past"` to `CellarParams`; `filterAndSort` filters rows whose `drinkStatus(drinkFrom, drinkTo, currentYear).key` matches (rows without a window are excluded when the filter is set). Pure + TDD (currentYear injected). `src/app/cellar/page.tsx`: a 5th `<select name="window">` — Toutes fenêtres / Trop jeune / **À l'apogée** / À boire vite / Apogée passée. |

## Explicitly skipped (YAGNI / not applicable)

`ensureWine` scan optimization (tiny catalog), LWIN colour mapping (user uses winemag), `wines.color` NOT NULL migration, auth on the image route (shared non-sensitive catalog — accepted), image-route placeholder cache-header pairing (cosmetic), swap-on-drop in the builder, keepsake box.

## Testing

TDD where there's pure logic: `todayLocalISO`, the window filter in `filters.ts`, StarRating keyboard handler if extracted pure. The tsc/lint fixes are verified by `tsc --noEmit` / `pnpm lint` going fully green — which becomes the new baseline (no more "pre-existing errors" allowance). Migration 0006 verified by `pnpm db:generate` output. Everything else: `pnpm test` + `pnpm build` + manual smoke (login redirect via proxy, add-with-enrichment seeds a snapshot, window filter).

## Sequencing

4 implementation batches in the table order (hygiene → robustness → a11y/UX → infra+filter). One plan document; batches map to subagent dispatches. After Batch 1, the CI baseline is "fully green" — later batches must keep it that way.
