# Phase 4 — Automatic Price Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every catalog wine gets an AI-estimated market quote (Tavily search → Mistral extraction), cached in `price_snapshots`, refreshed monthly by an in-process scheduler, and surfaced as: current quote + gain/loss on the wine page, a history sparkline, and a total-cellar-value banner.

**Architecture:** A new `src/price/` module mirroring `src/ai/` + `src/catalog/drink-window.ts` conventions: pure logic first (`staleness`, `valuation`, `sparkline`, tolerant zod schema), an injectable-fetch `lookupPrice`, a never-throwing `refreshWinePrice`, and a `setInterval` scheduler started from `instrumentation.ts`. **No DB migration** — the existing `price_snapshots` table fits.

**Tech Stack:** Next.js 16 (App Router, server components), Drizzle + Postgres, Zod 4, Vitest, Tavily + Mistral REST (free tiers), Marathon CSS tokens.

**Reference:** spec `docs/superpowers/specs/2026-07-02-winerr-phase4-price-tracking-design.md`.

---

## Baseline notes for every task
- Work from `/Users/nathanmercier/Documents/Project/frontend/winerr` on branch `phase4-price` (the controller creates it). GPG/SSH commit signing is DISABLED locally — plain `git commit`.
- `pnpm exec tsc --noEmit` has ~15 PRE-EXISTING errors only in `tests/ai-*.test.ts` — add ZERO new ones. `@` → `src`. Tests live flat in `tests/*.test.ts`.
- Existing pieces you build on: `price_snapshots` table in `src/db/schema.ts` (`priceSnapshots`: id, wineId, estimate/low/high numeric **nullable**, currency default "EUR", source, fetchedAt default now); `createTavilySearch({apiKey, fetchFn?})` in `src/ai/tavily.ts`; the Mistral chat-completions JSON pattern in `src/ai/enrich.ts`; the never-throw + lazy-db-imports pattern in `src/catalog/drink-window.ts`.

## File structure
- Create `src/price/staleness.ts` + `tests/price-staleness.test.ts` — pure staleness.
- Create `src/price/valuation.ts` + `tests/price-valuation.test.ts` — pure money math.
- Create `src/price/lookup.ts` + `tests/price-lookup.test.ts` — tolerant schema + Tavily→Mistral lookup (stubbed fetch).
- Create `src/price/service.ts` — `isPriceEnabled`, `refreshDays`, `refreshWinePrice` (never throws).
- Create `src/price/queries.ts` — `latestSnapshots`, `priceHistory`.
- Create `src/price/scheduler.ts` — `startPriceScheduler` (6 h sweeps, cap 25, 3 s pause).
- Create `src/price/sparkline.ts` + `tests/price-sparkline.test.ts` — pure SVG points.
- Modify `src/instrumentation.ts` — start the scheduler after migrations.
- Modify `src/cellar/actions.ts` — fire-and-forget quote on add.
- Modify `src/app/wine/[id]/page.tsx` — "Cote" block (quote + gain/loss + sparkline).
- Modify `src/app/cellar/page.tsx` — cellar-value banner.
- Modify `.env.example` — document `PRICE_REFRESH_DAYS`.

---

## Task 1: Pure staleness

**Files:**
- Create: `src/price/staleness.ts`
- Test: `tests/price-staleness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { needsRefresh } from "@/price/staleness";

const now = new Date("2026-07-02T12:00:00Z");

describe("needsRefresh", () => {
  it("is true when never fetched", () => {
    expect(needsRefresh(null, now, 30)).toBe(true);
  });
  it("is false within the window", () => {
    expect(needsRefresh(new Date("2026-06-10T12:00:00Z"), now, 30)).toBe(false);
  });
  it("is true past the window", () => {
    expect(needsRefresh(new Date("2026-05-01T12:00:00Z"), now, 30)).toBe(true);
  });
  it("honors a custom window", () => {
    expect(needsRefresh(new Date("2026-06-24T12:00:00Z"), now, 7)).toBe(true);
    expect(needsRefresh(new Date("2026-06-27T12:00:00Z"), now, 7)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/price-staleness.test.ts`
Expected: FAIL — cannot resolve `@/price/staleness`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/price/staleness.ts
// Pure: does a wine's quote need refreshing? A snapshot older than refreshDays
// (or no snapshot at all) is stale. Failed lookups also produce a snapshot, so
// a failure isn't retried before the next window.
export function needsRefresh(latestFetchedAt: Date | null, now: Date, refreshDays: number): boolean {
  if (!latestFetchedAt) return true;
  return now.getTime() - latestFetchedAt.getTime() > refreshDays * 24 * 60 * 60 * 1000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/price-staleness.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/price/staleness.ts tests/price-staleness.test.ts
git commit -m "feat(price): pure quote staleness"
```

---

## Task 2: Pure valuation

**Files:**
- Create: `src/price/valuation.ts`
- Test: `tests/price-valuation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { gainLossPct, cellarValue } from "@/price/valuation";

describe("gainLossPct", () => {
  it("computes signed percentage vs purchase", () => {
    expect(gainLossPct(12, 18)).toBe(50);
    expect(gainLossPct(20, 15)).toBe(-25);
  });
  it("rounds to the nearest integer", () => {
    expect(gainLossPct(30, 40)).toBe(33);
  });
  it("returns null for a non-positive purchase price", () => {
    expect(gainLossPct(0, 18)).toBeNull();
    expect(gainLossPct(-5, 18)).toBeNull();
  });
});

describe("cellarValue", () => {
  const rows = [
    { quantity: 2, purchasePrice: 10, estimate: 15 },   // 20 buy, 30 est
    { quantity: 1, purchasePrice: null, estimate: 40 }, // no buy, 40 est
    { quantity: 3, purchasePrice: 8, estimate: null },  // 24 buy, unquoted
  ];
  it("sums estimates and purchases independently", () => {
    expect(cellarValue(rows)).toEqual({ estimated: 70, purchase: 44, deltaPct: 59 });
  });
  it("has a null delta when there is no purchase total", () => {
    expect(cellarValue([{ quantity: 1, purchasePrice: null, estimate: 12 }])).toEqual({ estimated: 12, purchase: 0, deltaPct: null });
  });
  it("handles an empty cellar", () => {
    expect(cellarValue([])).toEqual({ estimated: 0, purchase: 0, deltaPct: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/price-valuation.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/price/valuation.ts
// Pure money math for quotes. Prices flow in as numbers (pages convert the
// numeric-string columns); nulls mean "unknown" and are simply skipped.

// Signed % change from purchase to current estimate, rounded. Null when the
// purchase price can't be a base (≤ 0).
export function gainLossPct(purchase: number, estimate: number): number | null {
  if (purchase <= 0) return null;
  return Math.round(((estimate - purchase) / purchase) * 100);
}

export type ValuationRow = { quantity: number; purchasePrice: number | null; estimate: number | null };

// Cellar totals: estimated = Σ estimate×qty over quoted wines; purchase =
// Σ price×qty where a price is set; deltaPct compares the two when possible.
export function cellarValue(rows: ValuationRow[]): { estimated: number; purchase: number; deltaPct: number | null } {
  let estimated = 0;
  let purchase = 0;
  for (const r of rows) {
    if (r.estimate != null) estimated += r.estimate * r.quantity;
    if (r.purchasePrice != null) purchase += r.purchasePrice * r.quantity;
  }
  const deltaPct = purchase > 0 ? Math.round(((estimated - purchase) / purchase) * 100) : null;
  return { estimated, purchase, deltaPct };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/price-valuation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/price/valuation.ts tests/price-valuation.test.ts
git commit -m "feat(price): pure gain/loss + cellar valuation"
```

---

## Task 3: Tolerant schema + lookupPrice (stubbed fetch)

**Files:**
- Create: `src/price/lookup.ts`
- Test: `tests/price-lookup.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { priceEstimateSchema, lookupPrice } from "@/price/lookup";

describe("priceEstimateSchema", () => {
  it("coerces French decimal strings and nulls unknowns", () => {
    const r = priceEstimateSchema.parse({ estimate: "18,50", low: null, high: "22 €", currency: null });
    expect(r).toEqual({ estimate: 18.5, low: null, high: 22, currency: null });
  });
  it("nulls an absurd estimate and an inconsistent range", () => {
    expect(priceEstimateSchema.parse({ estimate: 50000, low: null, high: null, currency: "EUR" }).estimate).toBeNull();
    const r = priceEstimateSchema.parse({ estimate: 18, low: 25, high: 12, currency: "EUR" });
    expect(r.low).toBeNull();
    expect(r.high).toBeNull();
  });
});

function fetchStub(tavilyBody: unknown, mistralContent: string | null): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("tavily")) {
      return new Response(JSON.stringify(tavilyBody), { status: 200 });
    }
    if (mistralContent === null) return new Response("oops", { status: 500 });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: mistralContent } }] }),
      { status: 200 },
    );
  }) as typeof fetch;
}

const wine = { producer: "Léoni", cuvee: null, vintage: 2019 };
const tavilyOk = { results: [{ title: "Léoni 2019", url: "https://www.idealwine.com/x", content: "18,50 €" }] };

describe("lookupPrice", () => {
  const env = process.env;
  it("returns the parsed estimate with the top result's host as source", async () => {
    process.env.TAVILY_API_KEY = "t";
    process.env.MISTRAL_API_KEY = "m";
    const q = await lookupPrice(wine, fetchStub(tavilyOk, JSON.stringify({ estimate: "18,50", low: 14, high: 22, currency: "EUR" })));
    expect(q).toEqual({ estimate: 18.5, low: 14, high: 22, currency: "EUR", source: "www.idealwine.com" });
  });
  it("returns null when Tavily finds nothing", async () => {
    process.env.TAVILY_API_KEY = "t";
    process.env.MISTRAL_API_KEY = "m";
    expect(await lookupPrice(wine, fetchStub({ results: [] }, "{}"))).toBeNull();
  });
  it("returns null on Mistral failure or garbage", async () => {
    process.env.TAVILY_API_KEY = "t";
    process.env.MISTRAL_API_KEY = "m";
    expect(await lookupPrice(wine, fetchStub(tavilyOk, null))).toBeNull();
    expect(await lookupPrice(wine, fetchStub(tavilyOk, "not json"))).toBeNull();
    expect(await lookupPrice(wine, fetchStub(tavilyOk, JSON.stringify({ estimate: null })))).toBeNull();
  });
  it("returns null without API keys", async () => {
    delete process.env.TAVILY_API_KEY;
    expect(await lookupPrice(wine, fetchStub(tavilyOk, "{}"))).toBeNull();
    process.env = { ...env };
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/price-lookup.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/price/lookup.ts
// Best-effort market-quote lookup: Tavily search → Mistral JSON extraction.
// Mirrors src/ai/enrich.ts. Returns null (never throws) when keys are missing,
// nothing is found, or the extraction is unusable. fetchFn is injectable for tests.
import { z } from "zod";
import { createTavilySearch } from "@/ai/tavily";

const looseMoney = z.preprocess((v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.,]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n >= 0.5 && n <= 10_000 ? n : null; // sane bottle-price bounds (EUR)
}, z.number().nullable());

const looseText = z.preprocess((v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}, z.string().nullable());

export const priceEstimateSchema = z
  .object({ estimate: looseMoney, low: looseMoney, high: looseMoney, currency: looseText })
  .transform((r) => {
    // Drop an inconsistent range rather than publish nonsense.
    if (r.low != null && r.high != null && r.low > r.high) return { ...r, low: null, high: null };
    return r;
  });

export type PriceQuote = { estimate: number; low: number | null; high: number | null; currency: string; source: string | null };

export async function lookupPrice(
  wine: { producer: string; cuvee?: string | null; vintage?: number | null },
  fetchFn: typeof fetch = fetch,
): Promise<PriceQuote | null> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!tavilyKey || !mistralKey || !wine.producer) return null;

  try {
    const search = createTavilySearch({ apiKey: tavilyKey, fetchFn });
    const query = ["prix", wine.producer, wine.cuvee ?? "", wine.vintage ?? "", "vin acheter"]
      .filter(Boolean)
      .join(" ");
    const results = await search(query, 5);
    if (results.length === 0) return null;

    const context = results
      .map((r) => `${r.title}\n${r.url}\n${r.content}`)
      .join("\n\n")
      .slice(0, 6000);

    const model = process.env.MISTRAL_MODEL || "pixtral-12b-latest";
    const res = await fetchFn("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${mistralKey}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content:
              "À partir de ces extraits web, estime le prix de marché actuel d'UNE bouteille de ce vin, en euros. " +
              "Renvoie UNIQUEMENT un JSON {estimate (nombre, prix typique), low (nombre, bas de fourchette), " +
              "high (nombre, haut de fourchette), currency (\"EUR\")}. Mets null pour toute valeur inconnue.\n\nExtraits:\n" +
              context,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content;
    if (!text) return null;
    const parsed = priceEstimateSchema.parse(JSON.parse(text));
    if (parsed.estimate == null) return null;

    let source: string | null = null;
    try {
      source = new URL(results[0].url).hostname;
    } catch {
      source = null;
    }
    return { estimate: parsed.estimate, low: parsed.low, high: parsed.high, currency: parsed.currency ?? "EUR", source };
  } catch (e) {
    console.error("[price] lookup failed", e);
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/price-lookup.test.ts`
Expected: PASS. (If the schema `.transform` type bothers zod 4, use a `.superRefine`-free plain function wrapper — but `.transform` on an object schema is supported.)

- [ ] **Step 5: Commit**

```bash
git add src/price/lookup.ts tests/price-lookup.test.ts
git commit -m "feat(price): tolerant estimate schema + Tavily→Mistral lookupPrice"
```

---

## Task 4: Service + queries

**Files:**
- Create: `src/price/service.ts`
- Create: `src/price/queries.ts`

> Thin orchestration over tested parts — no unit test (matches `drink-window.ts` / `queries.ts` conventions).

- [ ] **Step 1: Create `src/price/service.ts`**

```ts
// src/price/service.ts
// Quote refresh orchestration. Mirrors src/catalog/drink-window.ts: never
// throws, lazy db imports (safe to import when DATABASE_URL is unset).
import { needsRefresh } from "./staleness";
import { lookupPrice } from "./lookup";

export function isPriceEnabled(): boolean {
  return Boolean(process.env.TAVILY_API_KEY && process.env.MISTRAL_API_KEY);
}

export function refreshDays(): number {
  const n = Number(process.env.PRICE_REFRESH_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : 30;
}

// Fetch + store a fresh quote for a wine, unless its latest snapshot is still
// fresh. A failed lookup stores an EMPTY snapshot (estimate null, source
// "none") so the attempt is timestamped and not retried before the next window.
export async function refreshWinePrice(wineId: string): Promise<void> {
  try {
    if (!isPriceEnabled()) return;

    const { desc, eq } = await import("drizzle-orm");
    const { db } = await import("@/db");
    const { wines, priceSnapshots } = await import("@/db/schema");

    const wine = (await db.select().from(wines).where(eq(wines.id, wineId)).limit(1))[0];
    if (!wine) return;

    const latest = (await db
      .select({ fetchedAt: priceSnapshots.fetchedAt })
      .from(priceSnapshots)
      .where(eq(priceSnapshots.wineId, wineId))
      .orderBy(desc(priceSnapshots.fetchedAt))
      .limit(1))[0];
    if (!needsRefresh(latest?.fetchedAt ?? null, new Date(), refreshDays())) return;

    const quote = await lookupPrice({ producer: wine.producer, cuvee: wine.cuvee, vintage: wine.vintage });
    if (quote) {
      await db.insert(priceSnapshots).values({
        wineId,
        estimate: String(quote.estimate),
        low: quote.low != null ? String(quote.low) : null,
        high: quote.high != null ? String(quote.high) : null,
        currency: quote.currency,
        source: quote.source,
      });
    } else {
      await db.insert(priceSnapshots).values({ wineId, estimate: null, source: "none" });
    }
  } catch (e) {
    console.error("[price] refresh failed", e);
  }
}
```
(Note: `estimate/low/high` are Drizzle `numeric` columns → written as strings, like `purchasePrice` elsewhere.)

- [ ] **Step 2: Create `src/price/queries.ts`**

```ts
// src/price/queries.ts
import { desc, inArray, asc, eq, isNotNull, and } from "drizzle-orm";
import { db } from "@/db";
import { priceSnapshots } from "@/db/schema";

export type Snapshot = { wineId: string; estimate: number | null; low: number | null; high: number | null; fetchedAt: Date; source: string | null };

// Latest snapshot per wine (one query, newest-first, first-wins in app code —
// fine at personal-cellar scale).
export async function latestSnapshots(wineIds: string[]): Promise<Map<string, Snapshot>> {
  if (wineIds.length === 0) return new Map();
  const rows = await db
    .select({
      wineId: priceSnapshots.wineId,
      estimate: priceSnapshots.estimate,
      low: priceSnapshots.low,
      high: priceSnapshots.high,
      fetchedAt: priceSnapshots.fetchedAt,
      source: priceSnapshots.source,
    })
    .from(priceSnapshots)
    .where(inArray(priceSnapshots.wineId, wineIds))
    .orderBy(desc(priceSnapshots.fetchedAt));
  const map = new Map<string, Snapshot>();
  for (const r of rows) {
    if (map.has(r.wineId)) continue;
    map.set(r.wineId, {
      wineId: r.wineId,
      estimate: r.estimate != null ? Number(r.estimate) : null,
      low: r.low != null ? Number(r.low) : null,
      high: r.high != null ? Number(r.high) : null,
      fetchedAt: r.fetchedAt,
      source: r.source,
    });
  }
  return map;
}

// All non-empty estimates of a wine, oldest first — the sparkline series.
export async function priceHistory(wineId: string): Promise<{ estimate: number; fetchedAt: Date }[]> {
  const rows = await db
    .select({ estimate: priceSnapshots.estimate, fetchedAt: priceSnapshots.fetchedAt })
    .from(priceSnapshots)
    .where(and(eq(priceSnapshots.wineId, wineId), isNotNull(priceSnapshots.estimate)))
    .orderBy(asc(priceSnapshots.fetchedAt));
  return rows.map((r) => ({ estimate: Number(r.estimate), fetchedAt: r.fetchedAt }));
}
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm exec tsc --noEmit` (no new errors), `pnpm test` (green).

```bash
git add src/price/service.ts src/price/queries.ts
git commit -m "feat(price): refreshWinePrice service + snapshot queries"
```

---

## Task 5: Scheduler + wiring (instrumentation, on-add, .env.example)

**Files:**
- Create: `src/price/scheduler.ts`
- Modify: `src/instrumentation.ts`
- Modify: `src/cellar/actions.ts`
- Modify: `.env.example`

- [ ] **Step 1: Create `src/price/scheduler.ts`**

```ts
// src/price/scheduler.ts
// In-process quote refresher. Started once from instrumentation.ts on boot
// (long-lived Docker process — NOT serverless-safe, same caveat as the other
// fire-and-forget jobs). A sweep is one cheap SQL scan; API quota is only
// spent on wines whose snapshot is older than PRICE_REFRESH_DAYS.
import { needsRefresh } from "./staleness";
import { isPriceEnabled, refreshDays, refreshWinePrice } from "./service";
import { latestSnapshots } from "./queries";

const SWEEP_MS = 6 * 60 * 60 * 1000; // 6 h between sweeps
const FIRST_SWEEP_MS = 60 * 1000;    // first sweep ~1 min after boot
const MAX_PER_SWEEP = 25;            // cap quota bursts; backlog drains across sweeps
const PAUSE_MS = 3_000;              // politeness between lookups

let started = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sweep(): Promise<void> {
  try {
    // Wines someone still holds in-cellar — never spend quota on drunk-only wines.
    const { eq } = await import("drizzle-orm");
    const { db } = await import("@/db");
    const { cellarItems } = await import("@/db/schema");
    const held = await db
      .selectDistinct({ wineId: cellarItems.wineId })
      .from(cellarItems)
      .where(eq(cellarItems.status, "in_cellar"));
    const wineIds = held.map((r) => r.wineId);
    if (wineIds.length === 0) return;

    const latest = await latestSnapshots(wineIds);
    const days = refreshDays();
    const now = new Date();
    const stale = wineIds.filter((id) => needsRefresh(latest.get(id)?.fetchedAt ?? null, now, days));
    for (const wineId of stale.slice(0, MAX_PER_SWEEP)) {
      await refreshWinePrice(wineId);
      await sleep(PAUSE_MS);
    }
  } catch (e) {
    console.error("[price] sweep failed", e);
  }
}

export function startPriceScheduler(): void {
  if (started || !isPriceEnabled()) return;
  started = true;
  setTimeout(() => void sweep(), FIRST_SWEEP_MS);
  setInterval(() => void sweep(), SWEEP_MS);
  console.log(`[price] scheduler started (refresh every ${refreshDays()} days, sweep every 6 h)`);
}
```

- [ ] **Step 2: Start it from `src/instrumentation.ts`**

The file currently runs migrations inside the `NEXT_RUNTIME === "nodejs"` check. Add the scheduler right after `await runMigrations();`:

```ts
    const { startPriceScheduler } = await import("@/price/scheduler");
    startPriceScheduler();
```

- [ ] **Step 3: Quote on add in `src/cellar/actions.ts`**

Add one import near the existing `refreshDrinkWindow` import:
```ts
import { refreshWinePrice } from "@/price/service";
```
In `addBottleAction`, directly after the existing `void refreshDrinkWindow(wineId);` line, add:
```ts
  // Fire-and-forget: fetch a market quote if none is fresh (same caveat as above).
  void refreshWinePrice(wineId);
```

- [ ] **Step 4: Document the env var in `.env.example`**

Append:
```
# Price tracking: quotes are re-estimated when older than this many days (default 30).
# Requires TAVILY_API_KEY + MISTRAL_API_KEY; the feature disables itself without them.
PRICE_REFRESH_DAYS=30
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm exec tsc --noEmit` (no new errors), `pnpm test` (green), `pnpm build` (succeeds).

```bash
git add src/price/scheduler.ts src/instrumentation.ts src/cellar/actions.ts .env.example
git commit -m "feat(price): in-process refresh scheduler + quote-on-add + config"
```

---

## Task 6: Sparkline (pure) + wine-page "Cote" block

**Files:**
- Create: `src/price/sparkline.ts`
- Test: `tests/price-sparkline.test.ts`
- Modify: `src/app/wine/[id]/page.tsx`

- [ ] **Step 1: Write the failing sparkline test**

```ts
import { describe, it, expect } from "vitest";
import { sparklinePoints } from "@/price/sparkline";

describe("sparklinePoints", () => {
  it("maps a series onto the box, min at bottom, max at top", () => {
    expect(sparklinePoints([10, 20], 100, 30)).toBe("0,30 100,0");
  });
  it("draws a flat series at mid-height", () => {
    expect(sparklinePoints([15, 15, 15], 100, 30)).toBe("0,15 50,15 100,15");
  });
  it("returns an empty string for fewer than 2 points", () => {
    expect(sparklinePoints([12], 100, 30)).toBe("");
    expect(sparklinePoints([], 100, 30)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/price-sparkline.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/price/sparkline.ts`**

```ts
// src/price/sparkline.ts
// Pure: map a numeric series onto an SVG <polyline points> string of the given
// box. Min → bottom, max → top; a flat series sits at mid-height.
export function sparklinePoints(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = span === 0 ? height / 2 : height - ((v - min) / span) * height;
      return `${round2(x)},${round2(y)}`;
    })
    .join(" ");
}

const round2 = (n: number) => Math.round(n * 100) / 100;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/price-sparkline.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the "Cote" block to `src/app/wine/[id]/page.tsx`**

Add imports at the top:
```ts
import { latestSnapshots, priceHistory } from "@/price/queries";
import { isPriceEnabled } from "@/price/service";
import { gainLossPct } from "@/price/valuation";
import { sparklinePoints } from "@/price/sparkline";
```
After the `const ds = drinkStatus(...)` line, load the data:
```ts
  const priceEnabled = isPriceEnabled();
  const snapshot = priceEnabled ? (await latestSnapshots([wine.id])).get(wine.id) ?? null : null;
  const history = priceEnabled ? await priceHistory(wine.id) : [];
  const spark = sparklinePoints(history.map((h) => h.estimate), 220, 36);
  const fmtEur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: n < 100 ? 2 : 0 })} €`;
```
Then insert this block right AFTER the existing "Fenêtre de dégustation" card `</div>` and BEFORE the `<h2 ...>Mon avis</h2>` heading (render nothing at all when `!priceEnabled`):
```tsx
      {priceEnabled && (
        <div style={{ marginTop: "var(--s-4)", padding: "var(--s-5)", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
          <div style={{ fontSize: "var(--t-kicker)", textTransform: "uppercase", letterSpacing: 1.5, color: "var(--ink-mute)" }}>Cote estimée</div>
          {snapshot?.estimate != null ? (
            <div style={{ marginTop: "var(--s-2)" }}>
              <span style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h2)" }}>{fmtEur(snapshot.estimate)}</span>
              {snapshot.low != null && snapshot.high != null && (
                <span style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginLeft: "var(--s-2)" }}>
                  ({fmtEur(snapshot.low)} – {fmtEur(snapshot.high)})
                </span>
              )}
              <div style={{ color: "var(--ink-mute)", fontSize: "var(--t-meta)", marginTop: 4 }}>
                estimé le {snapshot.fetchedAt.toLocaleDateString("fr-FR")}{snapshot.source && snapshot.source !== "none" ? ` · ${snapshot.source}` : ""}
              </div>
              {spark && (
                <svg viewBox="0 0 220 36" width={220} height={36} style={{ marginTop: "var(--s-3)", display: "block" }} aria-label="Évolution de la cote">
                  <polyline points={spark} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
                </svg>
              )}
            </div>
          ) : (
            <div style={{ marginTop: "var(--s-2)", color: "var(--ink-mute)", fontSize: "var(--t-small)" }}>
              {snapshot ? "—" : "Cote en attente"}
            </div>
          )}
        </div>
      )}
```
Finally, enrich the per-bottle list: inside the existing `bottles.map((b) => ...)` `<li>`, after the `{b.purchaseDate ? ... : ""}` expression, add the gain/loss (uses the snapshot + purchase price):
```tsx
            {(() => {
              const buy = b.purchasePrice != null ? Number(b.purchasePrice) : null;
              const pct = buy != null && snapshot?.estimate != null ? gainLossPct(buy, snapshot.estimate) : null;
              return pct != null ? (
                <span style={{ marginLeft: "var(--s-2)", color: pct >= 0 ? "var(--good)" : "var(--warn)", fontWeight: 600 }}>
                  {pct >= 0 ? "+" : ""}{pct} %
                </span>
              ) : null;
            })()}
```

- [ ] **Step 6: Verify + commit**

Run: `pnpm exec tsc --noEmit` (no new errors), `pnpm build` (succeeds), `pnpm test` (green).

```bash
git add src/price/sparkline.ts tests/price-sparkline.test.ts "src/app/wine/[id]/page.tsx"
git commit -m "feat(price): wine-page quote block, gain/loss, history sparkline"
```

---

## Task 7: Cellar-value banner

**Files:**
- Modify: `src/app/cellar/page.tsx`

- [ ] **Step 1: Load the valuation data**

Add imports at the top of `src/app/cellar/page.tsx`:
```ts
import { latestSnapshots } from "@/price/queries";
import { isPriceEnabled } from "@/price/service";
import { cellarValue } from "@/price/valuation";
```
After the existing `const options = filterOptions(all);` line, add:
```ts
  const inCellar = all.filter((b) => b.status === "in_cellar");
  const snapshots = isPriceEnabled() ? await latestSnapshots([...new Set(inCellar.map((b) => b.wineId))]) : new Map();
  const value = cellarValue(inCellar.map((b) => ({
    quantity: b.quantity,
    purchasePrice: b.purchasePrice != null ? Number(b.purchasePrice) : null,
    estimate: snapshots.get(b.wineId)?.estimate ?? null,
  })));
  const fmtEur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
```

- [ ] **Step 2: Render the banner**

Insert right AFTER the `</header>` closing tag and BEFORE the `<form method="get" ...>` filter form:
```tsx
      {value.estimated > 0 && (
        <p style={{ marginTop: "var(--s-3)", fontSize: "var(--t-small)", color: "var(--ink-soft)" }}>
          Valeur estimée : <b style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h3)", color: "var(--ink)" }}>{fmtEur(value.estimated)}</b>
          {value.purchase > 0 && (
            <>
              {" "}· achat : {fmtEur(value.purchase)}
              {value.deltaPct != null && (
                <span style={{ marginLeft: "var(--s-2)", color: value.deltaPct >= 0 ? "var(--good)" : "var(--warn)", fontWeight: 600 }}>
                  {value.deltaPct >= 0 ? "+" : ""}{value.deltaPct} %
                </span>
              )}
            </>
          )}
        </p>
      )}
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm exec tsc --noEmit` (no new errors), `pnpm build` (succeeds), `pnpm test` (green).

```bash
git add src/app/cellar/page.tsx
git commit -m "feat(price): cellar estimated-value banner"
```

---

## Task 8: Full verification

- [ ] **Step 1:** `pnpm test` — all green (118 existing + ~15 new across price-staleness/valuation/lookup/sparkline).
- [ ] **Step 2:** `pnpm exec tsc --noEmit` — no new errors beyond the pre-existing `tests/ai-*.test.ts` baseline.
- [ ] **Step 3:** `pnpm build` — succeeds; no new route (all changes are on existing pages).
- [ ] **Step 4: Manual smoke (dev DB + real keys, optional):** boot `pnpm dev` → console shows `[price] scheduler started (refresh every 30 days, sweep every 6 h)`; ~1 min later the first sweep quotes held wines (watch the console/DB); wine page shows the quote block ("Cote en attente" → the estimate); cellar list shows the value banner. Without keys: no scheduler log, no quote block, no banner — and nothing crashes.
- [ ] **Step 5:** `git add -A && git commit -m "fix(price): smoke fixes" || echo "nothing to commit"`

## Done when

- Held wines get quotes automatically (boot sweep + 6 h sweeps + on-add), respecting `PRICE_REFRESH_DAYS` (default 30) and the free-tier quotas (≤ 25/sweep, 3 s pause, in-cellar wines only, failures timestamped).
- The wine page shows quote + range + date/source, per-bottle gain/loss, and a history sparkline; the cellar list shows total estimated value vs purchase.
- Everything degrades gracefully without API keys. `pnpm test`, `tsc`, `build` green.
- **This completes the MVP's third and final feature.**
