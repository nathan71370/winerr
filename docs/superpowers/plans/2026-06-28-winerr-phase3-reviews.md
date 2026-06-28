# Winerr Phase 3 — Reviews & Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user give one editable 5-star (half-star) rating + tasting note per wine — quick-rate from the cellar list, full review from the wine-detail page — and sort the cellar by rating.

**Architecture:** A pure rating-math module (snap to 0.5 steps, per-star fills) backs a `StarRating` client component used in two places. Auth-scoped server actions upsert the single review per `(userId, wineId)` (enforced by a new unique constraint). `listCellar` and `getWineWithBottles` are extended to include the user's rating/review.

**Tech Stack:** Next.js 16 (App Router, server + client components, server actions), Drizzle, Vitest.

**Builds on:** Phase 2. Relevant existing: `src/db/schema.ts` (`reviews` table: id, userId, wineId, rating numeric(2,1), tastingNote, tastedAt, createdAt — no unique constraint yet), `src/cellar/queries.ts` (`listCellar`, `getWineWithBottles`), `src/cellar/filters.ts` (`CellarBottle`, `CellarParams`, `filterAndSort`), `src/app/cellar/page.tsx`, `src/app/wine/[id]/page.tsx`, `src/auth/config.ts` (`auth`). The auth pattern `requireUserId()` exists inline in `src/cellar/actions.ts`.

---

## File Structure

```
src/
├── reviews/
│   ├── rating.ts            # pure: snapRating, starFills
│   └── actions.ts           # upsertRatingAction, upsertReviewAction
├── components/
│   └── StarRating.tsx       # client: half-star input + readonly display
├── cellar/
│   ├── RowRating.tsx        # client: list quick-rate (StarRating → upsertRatingAction)
│   ├── filters.ts           # MODIFY: CellarBottle.rating + "rating" sort
│   └── queries.ts           # MODIFY: listCellar rating join; getWineWithBottles review
├── app/
│   ├── cellar/page.tsx      # MODIFY: RowRating per row + "Note" sort option
│   └── wine/[id]/
│       ├── page.tsx         # MODIFY: render ReviewForm
│       └── ReviewForm.tsx   # client: stars + note + date → upsertReviewAction
└── db/schema.ts             # MODIFY: unique(userId, wineId) on reviews
tests/
├── rating.test.ts
└── cellar-filters.test.ts   # MODIFY: add a rating-sort test
```

---

## Task 1: Schema — one review per (user, wine)

**Files:**
- Modify: `src/db/schema.ts`
- Generate: `drizzle/0002_*.sql`

- [ ] **Step 1: Add the unique constraint**

In `src/db/schema.ts`, the `reviews` table is currently defined with no third argument. Add a table-extras callback with a unique constraint. Change:
```ts
export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  wineId: uuid("wine_id").notNull().references(() => wines.id),
  rating: numeric("rating", { precision: 2, scale: 1 }),
  tastingNote: text("tasting_note"),
  tastedAt: date("tasted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```
to add the constraint (note `unique` is already imported in this file — it's used by `wines`):
```ts
export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  wineId: uuid("wine_id").notNull().references(() => wines.id),
  rating: numeric("rating", { precision: 2, scale: 1 }),
  tastingNote: text("tasting_note"),
  tastedAt: date("tasted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqUserWine: unique("uniq_user_wine").on(t.userId, t.wineId),
}));
```

- [ ] **Step 2: Generate the migration**

Run: `DATABASE_URL=postgres://x:x@localhost:5432/x pnpm db:generate`
Expected: a new `drizzle/0002_*.sql` adding `CONSTRAINT "uniq_user_wine" UNIQUE("user_id","wine_id")` on `reviews`. Additive only — verify no DROP.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): one review per (user, wine) unique constraint"
```

---

## Task 2: Rating math (TDD)

**Files:**
- Create: `src/reviews/rating.ts`
- Test: `tests/rating.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/rating.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { snapRating, starFills } from "@/reviews/rating";

describe("snapRating", () => {
  it("rounds to the nearest half", () => {
    expect(snapRating(3.4)).toBe(3.5);
    expect(snapRating(2.2)).toBe(2);
    expect(snapRating(4.75)).toBe(5);
  });
  it("clamps to [0.5, 5]", () => {
    expect(snapRating(0)).toBe(0.5);
    expect(snapRating(-3)).toBe(0.5);
    expect(snapRating(6)).toBe(5);
  });
});

describe("starFills", () => {
  it("describes each of 5 stars for a half rating", () => {
    expect(starFills(3.5)).toEqual(["full", "full", "full", "half", "empty"]);
  });
  it("handles whole and zero", () => {
    expect(starFills(5)).toEqual(["full", "full", "full", "full", "full"]);
    expect(starFills(0)).toEqual(["empty", "empty", "empty", "empty", "empty"]);
    expect(starFills(1)).toEqual(["full", "empty", "empty", "empty", "empty"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/rating.test.ts`
Expected: FAIL — cannot resolve `@/reviews/rating`.

- [ ] **Step 3: Write minimal implementation**

Create `src/reviews/rating.ts`:
```ts
// Snap a raw value to a valid rating: 0.5 steps, clamped to [0.5, 5].
export function snapRating(raw: number): number {
  const snapped = Math.round(raw * 2) / 2;
  return Math.min(5, Math.max(0.5, snapped));
}

// Per-star fill states for a rating (5 entries): full / half / empty.
export function starFills(rating: number): ("full" | "half" | "empty")[] {
  const out: ("full" | "half" | "empty")[] = [];
  for (let s = 1; s <= 5; s++) {
    if (rating >= s) out.push("full");
    else if (rating >= s - 0.5) out.push("half");
    else out.push("empty");
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/rating.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/reviews/rating.ts tests/rating.test.ts
git commit -m "feat(reviews): add rating snap + star-fill helpers"
```

---

## Task 3: Filters — rating field + sort (TDD)

**Files:**
- Modify: `src/cellar/filters.ts`
- Modify: `tests/cellar-filters.test.ts`

- [ ] **Step 1: Add the failing test**

In `tests/cellar-filters.test.ts`, the fixture rows currently have no `rating`. Add `rating` to each fixture row (row "1" → `rating: "4.5"`, row "2" → `rating: null`, row "3" → `rating: "3.0"`) by adding `rating` to each object literal in the `rows` array. Then append this test inside `describe("filterAndSort", ...)`:
```ts
  it("sorts by rating descending, unrated last", () => {
    expect(filterAndSort(rows, { sort: "rating" }).map((b) => b.itemId)).toEqual(["1", "2"]);
  });
```
(Only in-cellar rows "1" and "2" survive the default status filter; rated "1" (4.5) sorts before unrated "2".)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/cellar-filters.test.ts`
Expected: FAIL — `rating` is not on `CellarBottle` (type error) and/or `"rating"` is not an accepted sort.

- [ ] **Step 3: Implement**

In `src/cellar/filters.ts`:

Add `rating` to the `CellarBottle` type (after `drinkTo`):
```ts
  rating: string | null;
```
Add `"rating"` to the `CellarParams` sort union:
```ts
  sort?: "name" | "vintage" | "drink" | "recent" | "price" | "rating";
```
Add a `rating` comparator to the `cmp` map (rating desc, unrated last via a -1 sentinel):
```ts
    rating: (a, b) => Number(b.rating ?? -1) - Number(a.rating ?? -1),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/cellar-filters.test.ts`
Expected: PASS (the new test + all existing).

- [ ] **Step 5: Commit**

```bash
git add src/cellar/filters.ts tests/cellar-filters.test.ts
git commit -m "feat(cellar): rating field + sort-by-rating"
```

---

## Task 4: Review actions

**Files:**
- Create: `src/reviews/actions.ts`

- [ ] **Step 1: Write the actions**

Create `src/reviews/actions.ts`:
```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { reviews } from "@/db/schema";
import { auth } from "@/auth/config";
import { snapRating } from "@/reviews/rating";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return id;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Quick-rate (stars only). Used by the cellar list and the detail star input.
export async function upsertRatingAction(wineId: string, rating: number): Promise<void> {
  const userId = await requireUserId();
  const r = snapRating(rating);
  await db
    .insert(reviews)
    .values({ userId, wineId, rating: String(r), tastedAt: today() })
    .onConflictDoUpdate({
      target: [reviews.userId, reviews.wineId],
      set: { rating: String(r) },
    });
  revalidatePath("/cellar");
  revalidatePath(`/wine/${wineId}`);
}

// Full review from the wine-detail form (stars + note + date).
export async function upsertReviewAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const wineId = String(formData.get("wineId"));
  const rawRating = Number(formData.get("rating"));
  if (!wineId || !rawRating) return; // no rating → nothing to save
  const rating = snapRating(rawRating);
  const tastingNote = (formData.get("tastingNote") as string) || null;
  const tastedAt = (formData.get("tastedAt") as string) || today();

  await db
    .insert(reviews)
    .values({ userId, wineId, rating: String(rating), tastingNote, tastedAt })
    .onConflictDoUpdate({
      target: [reviews.userId, reviews.wineId],
      set: { rating: String(rating), tastingNote, tastedAt },
    });
  revalidatePath("/cellar");
  redirect(`/wine/${wineId}`);
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: succeeds. (`redirect()` throws NEXT_REDIRECT by design — it is correctly outside any try/catch.)

- [ ] **Step 3: Commit**

```bash
git add src/reviews/actions.ts
git commit -m "feat(reviews): add upsert rating + review actions"
```

---

## Task 5: Query extensions — rating in listCellar + review in detail

**Files:**
- Modify: `src/cellar/queries.ts`

- [ ] **Step 1: Add the rating LEFT JOIN to listCellar**

In `src/cellar/queries.ts`, update the imports to include `reviews` and the helpers used below. The file already imports `{ and, desc, eq, ilike, or }` from `drizzle-orm` and `{ cellarItems, wines, lwinWines }` from `@/db/schema`. Add `reviews` to the schema import.

In `listCellar`, add `rating: reviews.rating` to the `.select({...})` projection (after `drinkTo: wines.drinkTo,`), and add a LEFT JOIN scoped to this user after the existing `.innerJoin(wines, ...)`:
```ts
    .leftJoin(reviews, and(eq(reviews.wineId, wines.id), eq(reviews.userId, userId)))
```
So the function becomes (full, replace `listCellar`):
```ts
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
      rating: reviews.rating,
    })
    .from(cellarItems)
    .innerJoin(wines, eq(cellarItems.wineId, wines.id))
    .leftJoin(reviews, and(eq(reviews.wineId, wines.id), eq(reviews.userId, userId)))
    .where(eq(cellarItems.userId, userId))
    .orderBy(desc(cellarItems.createdAt));
}
```

- [ ] **Step 2: Return the user's review from getWineWithBottles**

Update `getWineWithBottles` to also load the user's review and include it:
```ts
export async function getWineWithBottles(userId: string, wineId: string) {
  const wine = (await db.select().from(wines).where(eq(wines.id, wineId)).limit(1))[0];
  if (!wine) return null;
  const bottles = await db
    .select()
    .from(cellarItems)
    .where(and(eq(cellarItems.userId, userId), eq(cellarItems.wineId, wineId)));
  const review =
    (await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.userId, userId), eq(reviews.wineId, wineId)))
      .limit(1))[0] ?? null;
  return { wine, bottles, review };
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: succeeds. The `listCellar` row type now includes `rating: string | null`, structurally matching `CellarBottle` (which gained `rating` in Task 3).

- [ ] **Step 4: Commit**

```bash
git add src/cellar/queries.ts
git commit -m "feat(cellar): include user rating in listCellar and review in wine detail"
```

---

## Task 6: StarRating component + list RowRating

**Files:**
- Create: `src/components/StarRating.tsx`
- Create: `src/cellar/RowRating.tsx`

- [ ] **Step 1: Write the StarRating client component**

Create `src/components/StarRating.tsx`:
```tsx
"use client";

import type { CSSProperties } from "react";
import { starFills } from "@/reviews/rating";

// Half-star aware star rating. Read-only by default; pass onRate to make it
// interactive (click the left half of a star for X.5, the right half for X).
export function StarRating({
  value,
  onRate,
  size = 22,
}: {
  value: number | null;
  onRate?: (rating: number) => void;
  size?: number;
}) {
  const fills = starFills(value ?? 0);
  const interactive = !!onRate;

  function handle(e: React.MouseEvent<HTMLSpanElement>, index: number) {
    if (!onRate) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const leftHalf = e.clientX - rect.left < rect.width / 2;
    onRate(index + (leftHalf ? 0.5 : 1));
  }

  const wrap: CSSProperties = {
    display: "inline-flex",
    gap: 2,
    fontSize: size,
    lineHeight: 1,
    cursor: interactive ? "pointer" : "default",
  };

  return (
    <span style={wrap} aria-label={value != null ? `${value} sur 5` : "non noté"}>
      {fills.map((f, i) => (
        <span
          key={i}
          onClick={(e) => handle(e, i)}
          style={{ color: f === "empty" ? "var(--line)" : "var(--accent)" }}
        >
          {f === "half" ? (
            <span
              style={{
                background: "linear-gradient(90deg,var(--accent) 50%,var(--line) 50%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              ★
            </span>
          ) : (
            "★"
          )}
        </span>
      ))}
    </span>
  );
}
```

- [ ] **Step 2: Write the list RowRating wrapper**

Create `src/cellar/RowRating.tsx`:
```tsx
"use client";

import { useTransition } from "react";
import { StarRating } from "@/components/StarRating";
import { upsertRatingAction } from "@/reviews/actions";

// Quick-rate control for a cellar list row: clicking a star saves immediately.
export function RowRating({ wineId, value }: { wineId: string; value: number | null }) {
  const [pending, start] = useTransition();
  return (
    <span style={{ opacity: pending ? 0.5 : 1 }}>
      <StarRating
        value={value}
        size={17}
        onRate={(r) => start(() => upsertRatingAction(wineId, r))}
      />
    </span>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/StarRating.tsx src/cellar/RowRating.tsx
git commit -m "feat(reviews): StarRating component + list quick-rate"
```

---

## Task 7: Cellar page — inline rating + "Note" sort

**Files:**
- Modify: `src/app/cellar/page.tsx`

- [ ] **Step 1: Wire the rating into the list**

In `src/app/cellar/page.tsx`:

(a) Add the import (with the other `@/` imports):
```ts
import { RowRating } from "@/cellar/RowRating";
```

(b) In the sort `<select>`, add a "Note" option. Find the existing options block:
```tsx
          <option value="recent">Récents</option>
          <option value="name">Nom</option>
          <option value="vintage">Millésime</option>
          <option value="drink">À boire avant</option>
          <option value="price">Prix</option>
```
and add after the price option:
```tsx
          <option value="rating">Note</option>
```

(c) In the bottle `<li>`, render the rating control. Find the drink-window badge block (the `{ds && (...)}` block inside the left-hand `<div>`); immediately AFTER that block (still inside the left `<div>`), add:
```tsx
                <div style={{ marginTop: 6 }}>
                  <RowRating wineId={b.wineId} value={b.rating != null ? Number(b.rating) : null} />
                </div>
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: succeeds. (`b.rating` exists now that `listCellar` returns it and `CellarBottle` declares it.)

- [ ] **Step 3: Commit**

```bash
git add src/app/cellar/page.tsx
git commit -m "feat(cellar): inline star rating + sort by note"
```

---

## Task 8: Wine detail — "Mon avis" form

**Files:**
- Create: `src/app/wine/[id]/ReviewForm.tsx`
- Modify: `src/app/wine/[id]/page.tsx`

- [ ] **Step 1: Write the ReviewForm client component**

Create `src/app/wine/[id]/ReviewForm.tsx`:
```tsx
"use client";

import { useState } from "react";
import { StarRating } from "@/components/StarRating";
import { upsertReviewAction } from "@/reviews/actions";

export function ReviewForm({
  wineId,
  initialRating,
  initialNote,
  initialDate,
}: {
  wineId: string;
  initialRating: number | null;
  initialNote: string;
  initialDate: string;
}) {
  const [rating, setRating] = useState<number | null>(initialRating);

  return (
    <form action={upsertReviewAction} style={{ display: "grid", gap: "var(--s-3)" }}>
      <input type="hidden" name="wineId" value={wineId} />
      <input type="hidden" name="rating" value={rating ?? ""} />
      <StarRating value={rating} onRate={setRating} size={28} />
      <textarea
        name="tastingNote"
        defaultValue={initialNote}
        placeholder="Notes de dégustation…"
        style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "var(--s-3)", fontSize: "var(--t-body)", minHeight: 80, background: "var(--card)" }}
      />
      <label style={{ fontSize: "var(--t-small)", color: "var(--ink-soft)", display: "grid", gap: 4 }}>
        Dégusté le
        <input
          type="date"
          name="tastedAt"
          defaultValue={initialDate}
          style={{ border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", padding: "var(--s-2) var(--s-3)", fontSize: "var(--t-body)", background: "var(--card)" }}
        />
      </label>
      <button
        disabled={rating == null}
        style={{ padding: "var(--s-3)", border: "none", borderRadius: "var(--radius-pill)", background: "var(--accent)", color: "#fff", fontSize: "var(--t-body)", cursor: "pointer" }}
      >
        Enregistrer
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Render the form on the wine-detail page**

In `src/app/wine/[id]/page.tsx`:

(a) Add the import:
```ts
import { ReviewForm } from "./ReviewForm";
```

(b) `getWineWithBottles` now returns `review`. Destructure it: find `const { wine, bottles } = data;` and change it to:
```ts
  const { wine, bottles, review } = data;
```

(c) Add a "Mon avis" section. Immediately BEFORE the `<h2 ...>Mes bouteilles</h2>` line, insert:
```tsx
      <h2 style={{ fontSize: "var(--t-h3)", marginTop: "var(--s-6)" }}>Mon avis</h2>
      <div style={{ marginTop: "var(--s-3)" }}>
        <ReviewForm
          wineId={wine.id}
          initialRating={review?.rating != null ? Number(review.rating) : null}
          initialNote={review?.tastingNote ?? ""}
          initialDate={review?.tastedAt ?? new Date().toISOString().slice(0, 10)}
        />
      </div>
```

- [ ] **Step 3: Verify build & tests**

Run: `pnpm build && pnpm test`
Expected: build succeeds; all tests pass (rating + filters + everything prior).

- [ ] **Step 4: Manual end-to-end note (coordinator will drive the browser)**

Do NOT run the docker/browser e2e — the coordinator verifies it. Your job ends at: build green, tests green, committed.

- [ ] **Step 5: Commit**

```bash
git add "src/app/wine/[id]/ReviewForm.tsx" "src/app/wine/[id]/page.tsx"
git commit -m "feat(wine): Mon avis review form (stars + note + date)"
```

---

## Self-Review Notes

- **Spec coverage:** unique (userId,wineId) + upsert (Task 1,4); rating math half-star (Task 2) backing `StarRating` (Task 6); quick-rate from list (Task 6 RowRating + Task 7) and full review from detail (Task 8); rating shown in list (Task 5,7) and detail (Task 5,8); sort by rating (Task 3,7); auth-scoped actions (Task 4). All spec sections map to a task.
- **No placeholders:** every step ships concrete code/commands.
- **Type consistency:** `snapRating`/`starFills` (Task 2) used by `StarRating` (Task 6) and the actions (Task 4); `CellarBottle.rating` + `"rating"` sort (Task 3) match `listCellar`'s new `rating` column (Task 5) and the page's `b.rating` use (Task 7); `getWineWithBottles` now returns `{ wine, bottles, review }` (Task 5) consumed by the detail page (Task 8); `upsertRatingAction(wineId, rating)` / `upsertReviewAction(formData)` signatures (Task 4) match the callers (RowRating Task 6, ReviewForm Task 8).
- **Known follow-ups:** a tasting-log (multiple reviews per wine) and community aggregation are deferred per the spec; `requireUserId` is re-declared inline in `reviews/actions.ts` (mirrors `cellar/actions.ts`) — a shared helper could dedupe later.
