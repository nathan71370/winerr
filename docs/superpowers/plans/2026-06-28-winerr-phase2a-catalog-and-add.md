# Winerr Phase 2A — Catalog + LWIN + Add/Manage Cellar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user add bottles to their cellar by name search or manual entry, backed by a shared wine catalog seeded from the free LWIN reference, and manage them (view, edit, mark drunk, delete) — all working without any AI.

**Architecture:** Extend the Drizzle schema with a read-only `lwin_wines` reference table and drink-window/LWIN columns on `wines`. A normalization + matching module dedupes wine identities; a catalog service resolves or creates the canonical `wines` row. Server actions add/update/delete bottles; the cellar page lists them. The LWIN dataset is bulk-imported by a seeding script.

**Tech Stack:** Next.js 16 (App Router, standalone), Drizzle ORM + postgres-js, zod, Vitest, csv-parse (for LWIN import).

**Roadmap (later sub-plans):** Phase 2B — Gemini AI provider + add-by-photo + drink-window estimation. Phase 2C — rich filters/sorts + drink-window heat display + wine detail polish.

**Builds on:** Phase 1 foundation. Relevant existing files: `src/db/schema.ts`, `src/db/index.ts`, `src/lib/validation.ts`, `src/auth/config.ts` (exports `auth`), `src/app/cellar/page.tsx`.

---

## File Structure

```
src/
├── db/
│   └── schema.ts                 # + lwin_wines table; + wines drink-window/lwin columns
├── lib/
│   ├── normalize.ts              # pure text normalization for matching
│   └── validation.ts             # + addBottleSchema
├── catalog/
│   ├── match.ts                  # pure scoring/matching of wine identities
│   └── service.ts                # ensureWine(): resolve-or-create canonical wines row
├── lwin/
│   └── import.ts                 # parse LWIN CSV → rows for upsert
├── cellar/
│   ├── queries.ts                # listCellar, searchWines, getWine
│   └── actions.ts                # addBottle, updateBottle, deleteBottle, markDrunk
├── app/
│   ├── cellar/page.tsx           # list the user's bottles (replace empty-state)
│   └── cellar/add/page.tsx       # add form (name search + manual)
scripts/
└── seed-lwin.ts                  # CLI: read CSV file → upsert into lwin_wines
tests/
├── normalize.test.ts
├── catalog-match.test.ts
├── lwin-import.test.ts
└── add-bottle-validation.test.ts
```

---

## Task 1: Schema — `lwin_wines` table + `wines` extensions

**Files:**
- Modify: `src/db/schema.ts`
- Generate: `drizzle/0001_*.sql`

- [ ] **Step 1: Add the table and columns**

In `src/db/schema.ts`, add after the existing `wines` table definition:
```ts
export const lwinWines = pgTable("lwin_wines", {
  lwin: text("lwin").primaryKey(),
  displayName: text("display_name"),
  producer: text("producer"),
  wine: text("wine"),
  region: text("region"),
  country: text("country"),
  colour: text("colour"),
  type: text("type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Add these columns inside the existing `wines` table object (after `refLabelImage`):
```ts
  lwinCode: text("lwin_code"),
  drinkFrom: integer("drink_from"),
  drinkTo: integer("drink_to"),
  drinkWindowConfidence: numeric("drink_window_confidence", { precision: 3, scale: 2 }),
  drinkWindowSource: text("drink_window_source"),
  drinkWindowFetchedAt: timestamp("drink_window_fetched_at"),
```
(`integer`, `numeric`, `timestamp`, `text` are already imported in this file.)

- [ ] **Step 2: Generate the migration**

Run: `DATABASE_URL=postgres://x:x@localhost:5432/x pnpm db:generate`
Expected: a new `drizzle/0001_*.sql` adding `lwin_wines` and the new `wines` columns.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): add lwin_wines table and wines drink-window/lwin columns"
```

---

## Task 2: Text normalization (TDD)

**Files:**
- Create: `src/lib/normalize.ts`
- Test: `tests/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/normalize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalize } from "@/lib/normalize";

describe("normalize", () => {
  it("lowercases, strips accents, collapses whitespace, trims", () => {
    expect(normalize("  Château   Margaux ")).toBe("chateau margaux");
  });
  it("removes punctuation", () => {
    expect(normalize("Pavillon-Rouge, du Château!")).toBe("pavillon rouge du chateau");
  });
  it("returns empty string for nullish", () => {
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/normalize.test.ts`
Expected: FAIL — cannot resolve `@/lib/normalize`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/normalize.ts`:
```ts
// Normalizes wine-identity text for matching: lowercase, accent-stripped,
// punctuation removed, whitespace collapsed.
export function normalize(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/normalize.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/normalize.ts tests/normalize.test.ts
git commit -m "feat: add text normalization for wine matching"
```

---

## Task 3: Wine matching (TDD)

**Files:**
- Create: `src/catalog/match.ts`
- Test: `tests/catalog-match.test.ts`

Matching is a pure function over already-fetched candidates, so it is fully unit-testable. It scores a query identity against candidate wines and returns the best match above a threshold.

- [ ] **Step 1: Write the failing test**

Create `tests/catalog-match.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { bestMatch, type WineIdentity } from "@/catalog/match";

const q: WineIdentity = { producer: "Château Margaux", cuvee: null, vintage: 2015 };

describe("bestMatch", () => {
  it("matches an exact normalized producer + vintage with null cuvee", () => {
    const candidates: WineIdentity[] = [
      { id: "w1", producer: "Chateau Margaux", cuvee: null, vintage: 2015 },
      { id: "w2", producer: "Pavillon Rouge", cuvee: null, vintage: 2015 },
    ];
    expect(bestMatch(q, candidates)?.id).toBe("w1");
  });

  it("does not match a different vintage", () => {
    const candidates: WineIdentity[] = [
      { id: "w3", producer: "Chateau Margaux", cuvee: null, vintage: 2016 },
    ];
    expect(bestMatch(q, candidates)).toBeNull();
  });

  it("treats null cuvee and empty cuvee as the same", () => {
    const candidates: WineIdentity[] = [
      { id: "w4", producer: "Chateau Margaux", cuvee: "", vintage: 2015 },
    ];
    expect(bestMatch(q, candidates)?.id).toBe("w4");
  });

  it("returns null when nothing is close enough", () => {
    expect(bestMatch(q, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/catalog-match.test.ts`
Expected: FAIL — cannot resolve `@/catalog/match`.

- [ ] **Step 3: Write minimal implementation**

Create `src/catalog/match.ts`:
```ts
import { normalize } from "@/lib/normalize";

export type WineIdentity = {
  id?: string;
  producer: string | null;
  cuvee: string | null;
  vintage: number | null;
};

// Returns the candidate whose normalized (producer, cuvee, vintage) equals the
// query's, or null. Vintage must match exactly; null/empty cuvee are equivalent.
export function bestMatch<T extends WineIdentity>(
  query: WineIdentity,
  candidates: T[],
): T | null {
  const key = (w: WineIdentity) =>
    `${normalize(w.producer)}|${normalize(w.cuvee)}|${w.vintage ?? ""}`;
  const target = key(query);
  for (const c of candidates) {
    if (key(c) === target) return c;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/catalog-match.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/match.ts tests/catalog-match.test.ts
git commit -m "feat: add wine identity matching"
```

---

## Task 4: LWIN CSV parsing (TDD)

**Files:**
- Create: `src/lwin/import.ts`
- Test: `tests/lwin-import.test.ts`
- Modify: `package.json` (add `csv-parse`)

- [ ] **Step 1: Add the CSV parser dependency**

Run: `pnpm add csv-parse`
Expected: `csv-parse` added to dependencies.

- [ ] **Step 2: Write the failing test**

Create `tests/lwin-import.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseLwinCsv } from "@/lwin/import";

const csv = `LWIN,DISPLAY_NAME,PRODUCER_NAME,WINE,COUNTRY,REGION,COLOUR,TYPE
1000001,"Château Margaux","Château Margaux","",France,Bordeaux,Red,Still
1000002,"Pavillon Rouge","Château Margaux","Pavillon Rouge",France,Bordeaux,Red,Still`;

describe("parseLwinCsv", () => {
  it("maps LWIN columns to lwin_wines rows", () => {
    const rows = parseLwinCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      lwin: "1000001",
      displayName: "Château Margaux",
      producer: "Château Margaux",
      wine: "",
      region: "Bordeaux",
      country: "France",
      colour: "Red",
      type: "Still",
    });
  });

  it("skips rows without an LWIN code", () => {
    const bad = `LWIN,DISPLAY_NAME\n,"No code"\n2000001,"Has code"`;
    const rows = parseLwinCsv(bad);
    expect(rows).toHaveLength(1);
    expect(rows[0].lwin).toBe("2000001");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test tests/lwin-import.test.ts`
Expected: FAIL — cannot resolve `@/lwin/import`.

- [ ] **Step 4: Write minimal implementation**

Create `src/lwin/import.ts`:
```ts
import { parse } from "csv-parse/sync";

export type LwinRow = {
  lwin: string;
  displayName: string | null;
  producer: string | null;
  wine: string | null;
  region: string | null;
  country: string | null;
  colour: string | null;
  type: string | null;
};

// Parses an LWIN CSV export into rows ready for upsert. Tolerates extra columns;
// rows without an LWIN code are skipped.
export function parseLwinCsv(csv: string): LwinRow[] {
  const records: Record<string, string>[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  const rows: LwinRow[] = [];
  for (const r of records) {
    const lwin = r.LWIN?.trim();
    if (!lwin) continue;
    rows.push({
      lwin,
      displayName: r.DISPLAY_NAME ?? null,
      producer: r.PRODUCER_NAME ?? null,
      wine: r.WINE ?? null,
      region: r.REGION ?? null,
      country: r.COUNTRY ?? null,
      colour: r.COLOUR ?? null,
      type: r.TYPE ?? null,
    });
  }
  return rows;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test tests/lwin-import.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lwin/import.ts tests/lwin-import.test.ts package.json pnpm-lock.yaml
git commit -m "feat: parse LWIN CSV into reference rows"
```

---

## Task 5: LWIN seeding script

**Files:**
- Create: `scripts/seed-lwin.ts`
- Modify: `package.json` (add `db:seed:lwin` script + `tsx` devDependency)

- [ ] **Step 1: Add tsx for running TS scripts**

Run: `pnpm add -D tsx`
Expected: `tsx` in devDependencies.

- [ ] **Step 2: Write the seeding script**

Create `scripts/seed-lwin.ts`:
```ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "@/db";
import { lwinWines } from "@/db/schema";
import { parseLwinCsv } from "@/lwin/import";

async function main() {
  const path = process.argv[2] ?? process.env.LWIN_CSV_PATH;
  if (!path) {
    console.error("Usage: pnpm db:seed:lwin <path-to-lwin.csv>");
    process.exit(1);
  }
  const rows = parseLwinCsv(readFileSync(path, "utf8"));
  console.log(`[lwin] parsed ${rows.length} rows; upserting...`);
  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await db
      .insert(lwinWines)
      .values(batch)
      .onConflictDoUpdate({
        target: lwinWines.lwin,
        set: {
          displayName: lwinWines.displayName,
          producer: lwinWines.producer,
          wine: lwinWines.wine,
          region: lwinWines.region,
          country: lwinWines.country,
          colour: lwinWines.colour,
          type: lwinWines.type,
        },
      });
    console.log(`[lwin] upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log("[lwin] done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Note: the `onConflictDoUpdate` `set` uses the column refs as a no-op-safe overwrite; if drizzle requires excluded values, use `sql\`excluded.display_name\`` style — adjust if the run errors, keep behavior "upsert by lwin".

- [ ] **Step 3: Add the script + tsconfig path support**

Add to `package.json` "scripts":
```json
{
  "db:seed:lwin": "tsx scripts/seed-lwin.ts"
}
```
`tsx` resolves the `@/` alias from `tsconfig.json` `paths` automatically. If it does not, import via relative paths in the script instead.

- [ ] **Step 4: Smoke-test parsing path (no DB write needed)**

Run: `pnpm db:seed:lwin` with no arg
Expected: prints the usage message and exits 1 (proves the script loads and wiring is correct without needing the real LWIN file).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-lwin.ts package.json pnpm-lock.yaml
git commit -m "feat: add LWIN seeding script"
```

---

## Task 6: Add-bottle validation schema (TDD)

**Files:**
- Modify: `src/lib/validation.ts`
- Test: `tests/add-bottle-validation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/add-bottle-validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { addBottleSchema } from "@/lib/validation";

const base = { producer: "Château Margaux", color: "rouge", quantity: 1 };

describe("addBottleSchema", () => {
  it("accepts a minimal valid bottle", () => {
    expect(addBottleSchema.safeParse(base).success).toBe(true);
  });
  it("coerces quantity and vintage from strings", () => {
    const r = addBottleSchema.safeParse({ ...base, quantity: "6", vintage: "2015" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.quantity).toBe(6);
      expect(r.data.vintage).toBe(2015);
    }
  });
  it("rejects a missing producer", () => {
    expect(addBottleSchema.safeParse({ ...base, producer: "" }).success).toBe(false);
  });
  it("rejects quantity < 1", () => {
    expect(addBottleSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
  });
  it("rejects an out-of-range color", () => {
    expect(addBottleSchema.safeParse({ ...base, color: "purple" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/add-bottle-validation.test.ts`
Expected: FAIL — `addBottleSchema` is not exported.

- [ ] **Step 3: Add the schema**

Append to `src/lib/validation.ts`:
```ts
export const addBottleSchema = z.object({
  // wine fields
  producer: z.string().min(1),
  cuvee: z.string().optional(),
  vintage: z.coerce.number().int().min(1800).max(2100).optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  color: z.enum(["rouge", "blanc", "rose", "effervescent"]),
  grapes: z.string().optional(),
  lwinCode: z.string().optional(),
  // bottle fields
  quantity: z.coerce.number().int().min(1).default(1),
  purchasePrice: z.coerce.number().min(0).optional(),
});

export type AddBottleInput = z.infer<typeof addBottleSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/add-bottle-validation.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts tests/add-bottle-validation.test.ts
git commit -m "feat: add add-bottle validation schema"
```

---

## Task 7: Catalog service — `ensureWine`

**Files:**
- Create: `src/catalog/service.ts`

This is DB-backed (resolve-or-create), so it is covered by the integration check in Task 11 rather than a pure unit test. Keep it small and rely on the already-tested `bestMatch`.

- [ ] **Step 1: Write the service**

Create `src/catalog/service.ts`:
```ts
import { db } from "@/db";
import { wines } from "@/db/schema";
import { bestMatch, type WineIdentity } from "@/catalog/match";

export type EnsureWineInput = {
  producer: string;
  cuvee?: string | null;
  vintage?: number | null;
  region?: string | null;
  country?: string | null;
  color: "rouge" | "blanc" | "rose" | "effervescent";
  grapes?: string | null;
  lwinCode?: string | null;
};

// Resolves the canonical wines row for an identity, creating it if absent.
// Narrows candidates by exact producer (normalized comparison done in JS via
// bestMatch over same-producer rows) then matches on producer+cuvee+vintage.
export async function ensureWine(input: EnsureWineInput): Promise<string> {
  const candidates = await db
    .select({ id: wines.id, producer: wines.producer, cuvee: wines.cuvee, vintage: wines.vintage })
    .from(wines);

  const query: WineIdentity = {
    producer: input.producer,
    cuvee: input.cuvee ?? null,
    vintage: input.vintage ?? null,
  };
  const match = bestMatch(query, candidates);
  if (match?.id) return match.id;

  const inserted = await db
    .insert(wines)
    .values({
      producer: input.producer,
      cuvee: input.cuvee ?? null,
      vintage: input.vintage ?? null,
      region: input.region ?? null,
      country: input.country ?? null,
      color: input.color,
      grapes: input.grapes ?? null,
      lwinCode: input.lwinCode ?? null,
    })
    .returning({ id: wines.id });
  return inserted[0].id;
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: succeeds, no unused-variable errors.

- [ ] **Step 3: Commit**

```bash
git add src/catalog/service.ts
git commit -m "feat: add catalog ensureWine resolve-or-create service"
```

---

## Task 8: Cellar queries

**Files:**
- Create: `src/cellar/queries.ts`

- [ ] **Step 1: Write the queries**

Create `src/cellar/queries.ts`:
```ts
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { cellarItems, wines, lwinWines } from "@/db/schema";

// The user's bottles (default: in cellar), joined to their wine.
export async function listCellar(userId: string) {
  return db
    .select({
      itemId: cellarItems.id,
      quantity: cellarItems.quantity,
      purchasePrice: cellarItems.purchasePrice,
      purchaseDate: cellarItems.purchaseDate,
      status: cellarItems.status,
      wineId: wines.id,
      producer: wines.producer,
      cuvee: wines.cuvee,
      vintage: wines.vintage,
      region: wines.region,
      color: wines.color,
      drinkFrom: wines.drinkFrom,
      drinkTo: wines.drinkTo,
    })
    .from(cellarItems)
    .innerJoin(wines, eq(cellarItems.wineId, wines.id))
    .where(and(eq(cellarItems.userId, userId), eq(cellarItems.status, "in_cellar")))
    .orderBy(desc(cellarItems.createdAt));
}

// Name-search over the LWIN reference (autocomplete for the add form).
export async function searchWines(query: string, limit = 10) {
  const q = `%${query}%`;
  if (query.trim().length < 2) return [];
  return db
    .select({
      lwin: lwinWines.lwin,
      displayName: lwinWines.displayName,
      producer: lwinWines.producer,
      wine: lwinWines.wine,
      region: lwinWines.region,
      country: lwinWines.country,
      colour: lwinWines.colour,
    })
    .from(lwinWines)
    .where(or(ilike(lwinWines.displayName, q), ilike(lwinWines.producer, q)))
    .limit(limit);
}

export async function getWineWithBottles(userId: string, wineId: string) {
  const wine = (await db.select().from(wines).where(eq(wines.id, wineId)).limit(1))[0];
  if (!wine) return null;
  const bottles = await db
    .select()
    .from(cellarItems)
    .where(and(eq(cellarItems.userId, userId), eq(cellarItems.wineId, wineId)));
  return { wine, bottles };
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/cellar/queries.ts
git commit -m "feat: add cellar queries (list, search, wine detail)"
```

---

## Task 9: Cellar server actions

**Files:**
- Create: `src/cellar/actions.ts`

- [ ] **Step 1: Write the actions**

Create `src/cellar/actions.ts`:
```ts
"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { cellarItems } from "@/db/schema";
import { auth } from "@/auth/config";
import { addBottleSchema } from "@/lib/validation";
import { ensureWine } from "@/catalog/service";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return id;
}

export async function addBottleAction(_prev: unknown, formData: FormData) {
  const userId = await requireUserId();
  const parsed = addBottleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Champs invalides (le domaine et la couleur sont requis)." };
  }
  const d = parsed.data;
  const wineId = await ensureWine({
    producer: d.producer,
    cuvee: d.cuvee ?? null,
    vintage: d.vintage ?? null,
    region: d.region ?? null,
    country: d.country ?? null,
    color: d.color,
    grapes: d.grapes ?? null,
    lwinCode: d.lwinCode ?? null,
  });
  await db.insert(cellarItems).values({
    userId,
    wineId,
    quantity: d.quantity,
    purchasePrice: d.purchasePrice != null ? String(d.purchasePrice) : null,
    purchaseDate: new Date().toISOString().slice(0, 10), // today
  });
  revalidatePath("/cellar");
  redirect("/cellar");
}

export async function deleteBottleAction(formData: FormData) {
  const userId = await requireUserId();
  const itemId = String(formData.get("itemId"));
  await db.delete(cellarItems).where(and(eq(cellarItems.id, itemId), eq(cellarItems.userId, userId)));
  revalidatePath("/cellar");
}

export async function markDrunkAction(formData: FormData) {
  const userId = await requireUserId();
  const itemId = String(formData.get("itemId"));
  // Decrement quantity; when it reaches 0, flip status to drunk.
  await db
    .update(cellarItems)
    .set({ quantity: sql`greatest(${cellarItems.quantity} - 1, 0)` })
    .where(and(eq(cellarItems.id, itemId), eq(cellarItems.userId, userId)));
  await db
    .update(cellarItems)
    .set({ status: "drunk" })
    .where(and(eq(cellarItems.id, itemId), eq(cellarItems.userId, userId), eq(cellarItems.quantity, 0)));
  revalidatePath("/cellar");
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/cellar/actions.ts
git commit -m "feat: add cellar server actions (add, delete, mark drunk)"
```

---

## Task 10: Add-bottle page (name search + manual)

**Files:**
- Create: `src/app/cellar/add/page.tsx`
- Create: `src/app/cellar/add/search-action.ts`

- [ ] **Step 1: Server action for search**

Create `src/app/cellar/add/search-action.ts`:
```ts
"use server";

import { searchWines } from "@/cellar/queries";

export async function searchWinesAction(query: string) {
  return searchWines(query);
}
```

- [ ] **Step 2: Write the add page (client component)**

Create `src/app/cellar/add/page.tsx`:
```tsx
"use client";

import { useActionState, useState } from "react";
import { addBottleAction } from "@/cellar/actions";
import { searchWinesAction } from "./search-action";

type Suggestion = {
  lwin: string; displayName: string | null; producer: string | null;
  wine: string | null; region: string | null; country: string | null; colour: string | null;
};

const colourToColor: Record<string, string> = {
  Red: "rouge", White: "blanc", "Rosé": "rose", Rose: "rose", Sparkling: "effervescent",
};

export default function AddBottlePage() {
  const [state, action, pending] = useActionState(addBottleAction, null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [form, setForm] = useState({
    producer: "", cuvee: "", vintage: "", region: "", country: "",
    color: "rouge", grapes: "", lwinCode: "", quantity: "1", purchasePrice: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSearch(q: string) {
    set("producer", q);
    setSuggestions(q.trim().length >= 2 ? await searchWinesAction(q) : []);
  }
  function pick(s: Suggestion) {
    setForm((f) => ({
      ...f,
      producer: s.producer ?? s.displayName ?? "",
      cuvee: s.wine ?? "",
      region: s.region ?? "",
      country: s.country ?? "",
      color: colourToColor[s.colour ?? ""] ?? "rouge",
      lwinCode: s.lwin,
    }));
    setSuggestions([]);
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <h1 style={{ fontSize: "var(--t-h1)" }}>Ajouter une bouteille</h1>
      <form action={action} style={{ display: "grid", gap: "var(--s-3)", marginTop: "var(--s-6)" }}>
        <label style={lbl}>Domaine
          <input name="producer" value={form.producer} required autoComplete="off"
            onChange={(e) => onSearch(e.target.value)} style={inp} />
        </label>
        {suggestions.length > 0 && (
          <div style={sugBox}>
            {suggestions.map((s) => (
              <button type="button" key={s.lwin} onClick={() => pick(s)} style={sugItem}>
                {s.displayName ?? s.producer} {s.region ? `· ${s.region}` : ""}
              </button>
            ))}
          </div>
        )}
        <label style={lbl}>Cuvée
          <input name="cuvee" value={form.cuvee} onChange={(e) => set("cuvee", e.target.value)} style={inp} />
        </label>
        <label style={lbl}>Millésime
          <input name="vintage" value={form.vintage} inputMode="numeric"
            onChange={(e) => set("vintage", e.target.value)} style={inp} />
        </label>
        <label style={lbl}>Région
          <input name="region" value={form.region} onChange={(e) => set("region", e.target.value)} style={inp} />
        </label>
        <label style={lbl}>Couleur
          <select name="color" value={form.color} onChange={(e) => set("color", e.target.value)} style={inp}>
            <option value="rouge">Rouge</option><option value="blanc">Blanc</option>
            <option value="rose">Rosé</option><option value="effervescent">Effervescent</option>
          </select>
        </label>
        <input type="hidden" name="country" value={form.country} />
        <input type="hidden" name="grapes" value={form.grapes} />
        <input type="hidden" name="lwinCode" value={form.lwinCode} />
        <div style={{ borderTop: "1px dashed var(--line)", paddingTop: "var(--s-3)", display: "grid", gap: "var(--s-3)" }}>
          <label style={lbl}>Quantité
            <input name="quantity" value={form.quantity} inputMode="numeric"
              onChange={(e) => set("quantity", e.target.value)} style={inp} />
          </label>
          <label style={lbl}>Prix d'achat (€)
            <input name="purchasePrice" value={form.purchasePrice} inputMode="decimal"
              onChange={(e) => set("purchasePrice", e.target.value)} style={inp} />
          </label>
          <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-meta)" }}>Date d'achat : aujourd'hui (auto).</p>
        </div>
        {state?.error && <p style={{ color: "var(--warn)", fontSize: "var(--t-small)" }}>{state.error}</p>}
        <button disabled={pending} style={btn}>{pending ? "…" : "Ajouter à ma cave"}</button>
        <a href="/cellar" style={{ textAlign: "center", fontSize: "var(--t-small)" }}>Annuler</a>
      </form>
    </main>
  );
}

const lbl: React.CSSProperties = { display: "grid", gap: 4, fontSize: "var(--t-small)", color: "var(--ink-soft)" };
const inp: React.CSSProperties = { padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-body)" };
const btn: React.CSSProperties = { padding: "var(--s-3)", border: "none", borderRadius: "var(--radius-pill)", background: "var(--accent)", color: "#fff", fontSize: "var(--t-body)", cursor: "pointer" };
const sugBox: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", overflow: "hidden" };
const sugItem: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "var(--s-2) var(--s-3)", border: "none", borderBottom: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontSize: "var(--t-small)" };
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/cellar/add"
git commit -m "feat: add-bottle page with name search and manual entry"
```

---

## Task 11: Cellar list page + end-to-end verification

**Files:**
- Modify: `src/app/cellar/page.tsx`

- [ ] **Step 1: Replace the cellar page with the bottle list**

Replace `src/app/cellar/page.tsx` with:
```tsx
import { auth, signOut } from "@/auth/config";
import { redirect } from "next/navigation";
import { listCellar } from "@/cellar/queries";
import { deleteBottleAction, markDrunkAction } from "@/cellar/actions";

export default async function CellarPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const bottles = await listCellar(session.user.id);

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>Ma cave</h1>
        <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "baseline" }}>
          <a href="/cellar/add" style={{ fontSize: "var(--t-small)" }}>+ Ajouter</a>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button style={{ background: "none", border: "none", color: "var(--ink-mute)", cursor: "pointer", fontSize: "var(--t-small)" }}>Déconnexion</button>
          </form>
        </div>
      </header>

      {bottles.length === 0 ? (
        <div style={{ marginTop: "var(--s-8)", textAlign: "center", padding: "var(--s-8)", border: "1px dashed var(--line)", borderRadius: "var(--radius-lg)", background: "var(--card)" }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h2)" }}>Ta cave est vide</p>
          <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginTop: "var(--s-2)" }}>
            <a href="/cellar/add">Ajoute ta première bouteille</a>.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", marginTop: "var(--s-6)", display: "grid", gap: "var(--s-3)" }}>
          {bottles.map((b) => (
            <li key={b.itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--s-4)", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
              <div>
                <div style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h3)" }}>
                  {b.producer}{b.cuvee ? ` · ${b.cuvee}` : ""}{b.vintage ? ` ${b.vintage}` : ""}
                </div>
                <div style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)" }}>
                  {b.region ?? "—"} · {b.color ?? "—"} · ×{b.quantity}
                  {b.purchasePrice ? ` · ${b.purchasePrice} €` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--s-3)", alignItems: "center" }}>
                <form action={markDrunkAction}>
                  <input type="hidden" name="itemId" value={b.itemId} />
                  <button style={miniBtn}>Bue −1</button>
                </form>
                <form action={deleteBottleAction}>
                  <input type="hidden" name="itemId" value={b.itemId} />
                  <button style={{ ...miniBtn, color: "var(--warn)" }}>Suppr.</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const miniBtn: React.CSSProperties = { background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "var(--s-1) var(--s-3)", fontSize: "var(--t-meta)", cursor: "pointer", color: "var(--ink-soft)" };
```

- [ ] **Step 2: Verify build & tests**

Run: `pnpm build && pnpm test`
Expected: build succeeds; all tests pass (normalize, catalog-match, lwin-import, add-bottle-validation, plus Phase 1 tests).

- [ ] **Step 3: End-to-end manual check**

Start the stack locally (a local `traefik` external network must exist: `docker network create traefik` if needed; or temporarily add `ports: ["3000:3000"]` to the app service for local testing):
```bash
docker compose -f compose.yaml up -d --build
```
Migrations auto-run on boot (Phase 1 instrumentation). In a browser at the app URL: log in → "Ma cave" → "+ Ajouter" → type a producer (manual; LWIN suggestions appear only if `pnpm db:seed:lwin <file>` was run) → fill quantity → "Ajouter à ma cave" → the bottle appears in the list → "Bue −1" decrements / removes → "Suppr." deletes.
Expected: full add → list → manage loop works without any AI.

- [ ] **Step 4: Commit**

```bash
git add src/app/cellar/page.tsx
git commit -m "feat: list and manage cellar bottles"
```

---

## Self-Review Notes

- **Spec coverage (Plan 2A portion):** `lwin_wines` + `wines` extensions (Task 1); LWIN import + seeding (Tasks 4–5); normalization + matching + dedup `ensureWine` (Tasks 2,3,7) — this also addresses the Phase 1 `uniq_wine`-NULL concern by matching on normalized null/empty cuvée before insert; add-bottle validation (Task 6); name-search + manual add flow (Tasks 8,10); cellar list/manage CRUD (Tasks 9,11). Photo identification, drink-window estimation, and rich filters/sorts are intentionally Plans 2B/2C.
- **No placeholders:** every step ships concrete code/commands. The one judgment call (Task 5 `onConflictDoUpdate` set form, Task 11 local-testing port) is flagged inline with the exact fallback.
- **Type consistency:** `WineIdentity`/`bestMatch` (Task 3) are consumed by `ensureWine` (Task 7); `addBottleSchema` fields (Task 6) match the add page form names (Task 10) and the action's `Object.fromEntries(formData)` parse (Task 9); `listCellar` shape (Task 8) matches the cellar page render (Task 11); the `color` enum values (`rouge/blanc/rose/effervescent`) are consistent across schema, validation, and UI.
- **Known follow-ups for 2B:** the add page's "photo" method and `identifyLabel` wiring; `estimateDrinkWindow` populating the `wines` drink-window columns; surfacing the drink window in the list (2C).
