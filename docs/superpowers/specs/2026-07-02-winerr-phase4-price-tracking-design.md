# Winerr — Phase 4: Automatic Price Tracking (design)

**Date:** 2026-07-02
**Status:** Approved (brainstorm), pending implementation plan
**Depends on:** Phases 1–3 + Layer 3 (all merged). Completes the third and last MVP feature.

## 1. Goal

No manual price entry — ever (hard MVP requirement). Each catalog wine gets an **estimated market quote** fetched by AI web search, cached and mutualized per wine, refreshed periodically. The user sees: the current quote, gain/loss vs their purchase price, the total estimated value of their cellar, and the quote's history over time.

## 2. Locked decisions (brainstorm)

| Decision | Choice |
|---|---|
| **Estimation engine** | Reuse the existing free AI stack: **Tavily search → Mistral JSON extraction**, behind the existing provider pattern. No paid pricing API, no scraping. Quality is best-effort (it's an *estimate*). |
| **Refresh cadence** | **Configurable via `PRICE_REFRESH_DAYS`, default 30** (monthly). Chosen to respect Tavily's ~1000 free credits/month (~70 wines ≈ 70 credits/month at monthly cadence). |
| **Scheduler** | **In-process**, started from `instrumentation.ts` after migrations (same boot pattern). Sweep every **6 h** + one initial sweep ~1 min after boot. A sweep with nothing stale costs zero API calls (one local SQL query); 6 h exists to drain backlogs fast (25-wine cap → 70 wines quoted in ~18 h) and to survive frequent container restarts. |
| **Quota guards** | Only refresh wines held **in-cellar by someone** (skip fully-drunk wines). **Cap 25 wines per sweep**, sequential with **~3 s pause** between lookups. Failed lookup → an empty snapshot (`estimate = null`, `source = "none"`) so the attempt is timestamped and retried only next cycle. |
| **On-add** | `addBottleAction` fire-and-forgets `refreshWinePrice(wineId)` when the wine has no fresh snapshot (same pattern/caveat as `refreshDrinkWindow` — relies on the long-lived Docker process, not serverless-safe). UI shows "Cote en attente" meanwhile. |
| **Display** | Wine detail: current quote + range + date/source, gain/loss vs purchase price, history sparkline. Cellar list: total estimated value vs total purchase. |
| **Currency** | EUR (schema default). No conversion — the extraction prompt asks for EUR estimates. |

## 3. Data model

**No migration.** The existing `price_snapshots` table (migration 0000) fits exactly:
`id, wineId → wines, estimate numeric NULL, low numeric NULL, high numeric NULL, currency default 'EUR', source text, fetchedAt timestamp default now`.

- A **successful lookup** inserts `{estimate, low?, high?, currency, source}`.
- A **failed lookup** inserts `{estimate: null, source: "none"}` — timestamps the attempt, prevents quota-burning retries within the same staleness window, and renders as "—".
- History = all snapshots of a wine ordered by `fetchedAt` (they accumulate naturally; no pruning at this scale).

## 4. New module `src/price/` (mirrors `src/ai/` conventions)

| file | responsibility |
|---|---|
| `staleness.ts` | **Pure**: `needsRefresh(latestFetchedAt: Date \| null, now: Date, refreshDays: number): boolean`. TDD. |
| `valuation.ts` | **Pure**: gain/loss per bottle (`purchase → quote, %`), cellar totals (Σ latest estimate × qty over in-cellar items with a quote; Σ purchase price × qty where set; delta %). TDD. |
| `lookup.ts` | `lookupPrice(wine, fetchImpl?)`: Tavily search ("prix {producer} {cuvee} {vintage} vin") → Mistral chat JSON extraction → tolerant zod schema (`priceEstimateSchema`: coerced numbers, French decimal commas, all fields nullable, sane bounds). Returns the estimate or `null`. Injectable fetch → unit-tested with stubs, no live calls. |
| `service.ts` | `refreshWinePrice(wineId)`: load wine → `lookupPrice` → insert snapshot (empty snapshot on failure). **Never throws** (logs), lazy db imports — same shape as `refreshDrinkWindow`. `isPriceEnabled()`: requires `TAVILY_API_KEY` + the AI provider key; everything degrades gracefully without. |
| `scheduler.ts` | `startPriceScheduler()`: guard on `isPriceEnabled()`; initial sweep after ~60 s; `setInterval` every 6 h. Sweep = one SQL query for eligible wines (in at least one `in_cellar` cellar item AND latest snapshot missing or older than `PRICE_REFRESH_DAYS`), take 25, sequential `refreshWinePrice` with 3 s pause. A sweep never throws. |
| `queries.ts` | `latestSnapshots(wineIds)` (latest snapshot per wine, one query — `DISTINCT ON` or window), `priceHistory(wineId)` (all snapshots asc). |

**Wiring:** `instrumentation.ts` calls `startPriceScheduler()` after the migration step. `addBottleAction` adds the fire-and-forget refresh. `.env.example` documents `PRICE_REFRESH_DAYS` (default 30).

## 5. UI

### Wine detail (`/wine/[id]`) — "Cote" block
- **Current quote**: `18 € (14–22 €)` + "estimé le {date} · {source}". States: no snapshot & price enabled → *"Cote en attente"*; empty snapshot → *"—"*; feature disabled (no keys) → block hidden.
- **Gain/loss**: for each of the user's bottles with a `purchasePrice`: `acheté 12 € → +50 %`, colored with the existing palette (sage gain / terracotta loss).
- **History**: a dependency-free inline **SVG sparkline** (~40 lines of pure rendering) of `estimate` over time, shown when ≥ 2 non-empty snapshots exist. Pure helper `sparklinePoints(history, w, h)` → tested; the component only draws.

### Cellar list (`/cellar`) — value banner
One sober line under the header, only when at least one wine has a quote:
**« Valeur estimée : 1 240 € · achat : 980 € · +26 % »** — computed by `valuation.ts` from `listCellar` rows joined with `latestSnapshots`. In-cellar bottles only; unquoted wines count for 0 in the estimate side; purchase total only over items with a price.

## 6. Error handling

- Tavily/Mistral errors, timeouts, unparseable JSON → `lookupPrice` returns `null` → empty snapshot; the scheduler continues with the next wine. Existing 429/503 retry inside the Mistral/Gemini providers applies.
- Absurd extractions guarded by zod bounds (estimate 0.5–10 000 €, low ≤ estimate ≤ high when present, else dropped to null).
- No keys → `isPriceEnabled()` false → scheduler never starts, UI hides the blocks. No crash paths.

## 7. Testing (TDD — pure first)

1. `staleness.ts` — fresh/stale/never-fetched boundaries.
2. `valuation.ts` — gain/loss math, totals with missing quotes/prices, empty cellar.
3. `priceEstimateSchema` — tolerant parsing (strings, commas, nulls, bound rejection).
4. `lookup.ts` — stubbed fetch: happy path, Tavily empty, Mistral garbage → null.
5. `sparklinePoints` — point mapping, flat series, < 2 points.
(Scheduler/service: thin orchestration over tested parts; verified in the manual smoke.)

## 8. Out of scope / deferred

- Manual price entry (excluded by requirement), paid pricing APIs, currency conversion, price alerts/notifications, pruning old snapshots, per-user quotes (quotes are catalog-level, mutualized by design).

## 9. Config

| env | default | role |
|---|---|---|
| `PRICE_REFRESH_DAYS` | `30` | staleness window per wine |
| `TAVILY_API_KEY` | — | required to enable the feature (with the AI provider key) |

Sweep interval (6 h) and per-sweep cap (25) are internal constants — `PRICE_REFRESH_DAYS` is what drives real cadence (YAGNI).
