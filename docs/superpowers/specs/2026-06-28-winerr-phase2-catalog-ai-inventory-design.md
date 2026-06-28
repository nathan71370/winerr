# Winerr Phase 2 — Catalog + AI + Inventory Design Spec

**Date:** 2026-06-28
**Status:** Approved (design phase)
**Author:** Nathan Mercier (with Claude)
**Builds on:** Phase 1 foundation (auth, schema, Docker/Komodo deploy). See `2026-06-27-winerr-mvp-design.md`.

## 1. Goal

Let a logged-in user fill their cellar. Add a bottle primarily by photographing its label (AI identifies the wine), with name-search and manual entry as fallbacks; manage the cellar (view, edit, mark drunk, delete) with rich filters and sorts. The wine catalog is shared across users and backed by the free LWIN reference dataset. Each wine gets an AI-estimated drinking window.

## 2. Scope

**In scope:**
- Add a bottle: photo (AI) → name search → manual fallback.
- Shared wine catalog, backed by the LWIN reference dataset for name search and dedup.
- AI-estimated drinking window per wine (cached), with optional per-bottle user override.
- Cellar management: list/grid view, edit bottle, decrement/mark drunk, delete.
- Rich filters (color, region, drink-window status, in-cellar/drunk) and sorts (name, vintage, drink-before, recently added, price).

**Out of scope (later phases):**
- Reviews & ratings → Phase 3.
- Automatic market price tracking (the cote) → Phase 4. (Note: user-entered *purchase price* IS in Phase 2 — it is the user's own data, distinct from the market quote.)
- Bottle location / physical-storage modeling / 3D cellar → 3D phase. The `cellar_items.location` column stays unused in Phase 2.

**Non-goals:**
- No reliable free drinking-window API exists (researched: CellarTracker, Oeni, Vivino, Wine-Searcher, Global Wine Score — all proprietary, crowd-derived, defunct, or no public API). The drinking window is therefore an **AI estimate**, surfaced as a range with a confidence flag, never presented as authoritative.

## 3. Architecture

Builds on the Phase 1 Next.js (App Router, standalone) + PostgreSQL (Drizzle) + Auth.js stack, self-hosted via Docker/Komodo. New pieces:

- **AI provider layer** — an isolated, provider-agnostic module. Default implementation: Google Gemini Flash (vision for label reading, text for drink-window estimation). Selected by env (`AI_PROVIDER`), key via `GEMINI_API_KEY`. The rest of the app depends only on the interface.
- **LWIN reference data** — the free Liv-ex LWIN dataset imported into a read-only `lwin_wines` table via a one-off seeding command. Powers name-search autocomplete and catalog dedup.
- **Catalog service** — given AI-extracted or user-entered wine fields, match against `lwin_wines` + existing `wines`, and return/create the canonical `wines` row.
- **Drink-window service** — asynchronously asks the AI provider to estimate `{from, to, confidence}` for a wine; caches the result on the `wines` row.

### AI provider interface

```
interface AIProvider {
  identifyLabel(image): Promise<LabelExtraction>      // vision → wine fields + confidence
  estimateDrinkWindow(wine): Promise<DrinkWindow | null>  // text → {from, to, confidence}
}

type LabelExtraction = {
  producer: string | null
  cuvee: string | null
  vintage: number | null
  region: string | null
  country: string | null
  color: "rouge" | "blanc" | "rose" | "effervescent" | null
  grapes: string | null
  confidence: number      // 0..1
}

type DrinkWindow = { from: number; to: number; confidence: number }  // years
```

- Default impl: Gemini Flash. Returns **typed errors** (no key, quota, timeout, low-confidence) so callers degrade gracefully.
- **No key configured** → the app stays usable: manual entry and name search work; drink windows show "—".

## 4. Data Model

### `lwin_wines` *(new, read-only reference)*
Imported from the LWIN dataset. Approximate columns (mapped from LWIN fields):
- `lwin` (text, PK) — the LWIN code (wine-level identity)
- `display_name`, `producer`, `wine` (cuvée), `region`, `country`, `colour`, `type`
- `created_at`

Indexed for name search (trigram / normalized text on producer + wine).

### `wines` *(existing catalog — extend)*
Add:
- `lwin_code` (text, nullable) — link to the matched `lwin_wines.lwin`, when matched.
- `drink_from` (integer, nullable) — estimated start year.
- `drink_to` (integer, nullable) — estimated end year.
- `drink_window_confidence` (numeric(3,2), nullable).
- `drink_window_source` (text, nullable) — e.g. `gemini`.
- `drink_window_fetched_at` (timestamp, nullable) — cache timestamp / staleness.

Existing columns unchanged: `producer`, `cuvee`, `vintage`, `region`, `country`, `color`, `grapes`, `ref_label_image`, unique(`producer`,`cuvee`,`vintage`).

### `cellar_items` *(existing — use)*
No new columns. Field usage in Phase 2:
- `quantity` — user-entered, default 1.
- `purchase_price` — user-entered, optional.
- `purchase_date` — defaults to today (editable).
- `my_photo` — the user's label photo (stored via the Phase 1 photo storage; FS/MinIO).
- `status` — `in_cellar` / `drunk`.
- `drink_from` / `drink_before` — optional **per-bottle override** of the wine-level estimate. Display rule: show the override if present, else the wine's estimated window.
- `location` — unused in Phase 2 (reserved for the 3D phase).

## 5. LWIN Import

- A seeding command (e.g. `pnpm db:seed:lwin`) reads the LWIN dataset file and bulk-inserts into `lwin_wines` (idempotent: upsert by `lwin`).
- The dataset file is provided out-of-band (downloaded from Liv-ex; not committed to the repo). The command accepts a path / env var to the file.
- Run once after migration on a fresh deploy; re-runnable to refresh.

## 6. Add-Bottle Flow (Option A — best guess, editable)

1. **Choose method:** take/upload photo · search by name · manual.
2. **Photo path:** image uploaded & validated → `identifyLabel(image)` → match extraction against `lwin_wines` + existing `wines` → render a **single pre-filled, editable form** (wine fields + a confidence chip). Low confidence or AI failure → same form, fields filled best-effort (or empty), user edits or switches to name search.
3. **Name-search path:** autocomplete against `lwin_wines` → pick → form pre-filled from the LWIN entry (+ user adds vintage).
4. **Manual path:** empty form.
5. **Bottle fields:** quantity (default 1), purchase price (optional), purchase date (auto = today, editable).
6. **Confirm:** the catalog service ensures a `wines` row exists (match LWIN/existing on normalized producer+cuvée+vintage, else create, linking `lwin_code` when matched) → create the `cellar_item` → if the wine has no cached drink window, **enqueue an async `estimateDrinkWindow` job**; the window appears once computed.

## 7. Cellar View

- **List/grid** of the user's bottles (default: in-cellar). Each row/card: wine name, vintage, color, region; quantity; **drink-window** rendered as `from–to` plus a status — "trop jeune", "à boire", "à boire avant {year}" — using the design system's z1→z5 heat scale; purchase price.
- **Filters:** color, region, drink-window status, in-cellar / drunk.
- **Sorts:** name, vintage, drink-before, recently added, purchase price.
- **Actions:** edit bottle; decrement quantity / mark drunk (status → `drunk`); delete.
- **Wine detail:** catalog info + drink window (with confidence) + the user's bottles of that wine.

## 8. Error Handling

Principle: never block the user.
- **AI label fail / low confidence** → editable form (best-effort or empty) → name search → manual. Never hard-blocks.
- **No `GEMINI_API_KEY`** → photo identification disabled with a clear message; manual + name search fully work; drink windows show "—".
- **LWIN no match** → free-text wine; a new `wines` row is created with `lwin_code` null.
- **Drink-window estimate fails / pending** → show "—"; retry later (a background refresh pass picks up wines with null/stale windows).
- **Image upload** → validate type/size; reject with a clear message.

## 9. Testing Strategy

- **AI layer:** mock the provider interface (no real API calls). Test the extraction→form mapping and every fallback path against fixtures.
- **Catalog/match:** unit-test normalization and LWIN/existing-wine matching (pure functions) — including the no-match → create path.
- **Drink window:** unit-test parsing/validation of the provider's `{from,to,confidence}` and the display rule (override vs estimate; status buckets).
- **Filters/sorts:** pure functions, unit-tested.
- **Cellar CRUD:** integration tests against a disposable test Postgres.
- **E2E (light):** add-by-photo happy path with a stubbed AI provider.

## 10. UI / Design System

Uses the Marathon UI Kit (Phase 1). Notable: the z1→z5 sage→terracotta scale maps naturally onto drink-window heat (too young → at peak → past). Instrument Serif for wine names/headings; warm cream/ink/terracotta throughout.

## 11. Open Questions / Future

- LWIN dataset acquisition + exact field mapping — finalize during implementation against the real file.
- Drink-window refresh cadence for stale estimates — tune once observed.
- Carried from Phase 1: `uniq_wine` unique constraint under-constrains with NULL `cuvee`/`vintage` (Postgres treats NULLs as distinct) — address as part of the catalog dedup work in this phase (`NULLS NOT DISTINCT` or a normalized empty-string convention), since dedup correctness now matters.
