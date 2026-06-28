# Winerr Phase 3 — Reviews & Ratings Design Spec

**Date:** 2026-06-28
**Status:** Approved (design phase)
**Author:** Nathan Mercier (with Claude)
**Builds on:** Phase 1 (the `reviews` table + "5 stars, personal ranking" decisions) and Phase 2 (cellar, wine catalog, wine-detail page, filters/sorts).

## 1. Goal

Let a user rate the wines in their cellar (5 stars, half-star precision) and write a tasting note — one editable review per wine. Ratings appear throughout (cellar list, wine detail), the cellar can be sorted by rating, and rating is quick from the list (click stars) or full from the wine-detail page (stars + note + date).

## 2. Scope

**In scope:**
- One editable review per (user, wine): a star rating (0.5–5.0, half-star steps) + an optional tasting note + a tasting date.
- Quick-rate inline from the cellar list (stars only).
- Full review (stars + note + date) from the wine-detail page.
- Show the user's rating on the cellar list and the wine-detail page.
- Sort the cellar by rating (the "classement").

**Out of scope:**
- Community/aggregated ratings (Phase 1 decided ratings are personal).
- A tasting log / multiple reviews per wine over time (Phase 3 chose one editable review per wine).
- Location/3D (separate later phase).

## 3. Architecture

Builds on the Phase 2 stack (Next.js App Router, Drizzle, Postgres, Auth.js). New pieces:

- **Rating math** — a pure helper that clamps/snaps a raw value to a valid rating (0.5–5.0 in 0.5 steps) and maps a rating to per-star fill states (full/half/empty). Unit-tested.
- **StarRating component** — a client component with two modes: an interactive input (click the left or right half of a star to pick X.5 or X.0) and a read-only display. Used in the cellar list (interactive, compact) and the wine-detail page (interactive, full).
- **Review service/actions** — auth-scoped server actions that upsert the user's review for a wine.
- **Query extensions** — `listCellar` and `getWineWithBottles` include the user's review.

## 4. Data Model

The `reviews` table already exists (Phase 1): `id` (uuid PK), `userId` (FK→users, cascade), `wineId` (FK→wines), `rating` (numeric(2,1)), `tastingNote` (text), `tastedAt` (date), `createdAt` (timestamp).

**Change:** add a **unique constraint on `(userId, wineId)`** so there is exactly one editable review per user per wine (enables upsert). Migration `0002`.

Field usage:
- `rating` — 0.5–5.0 in 0.5 steps (stored as the numeric string Drizzle expects).
- `tastingNote` — optional free text (set from the wine-detail page; left unchanged by quick-rate).
- `tastedAt` — defaults to today on first rating; editable on the detail page.

## 5. Rating Math (pure)

`src/reviews/rating.ts`:
- `snapRating(raw: number): number` — clamps to [0.5, 5] and rounds to the nearest 0.5.
- `starFills(rating: number): ("full" | "half" | "empty")[]` — returns 5 entries describing each star's fill for a given rating (e.g., 3.5 → [full, full, full, half, empty]).

Both pure and unit-tested. The half-star click maps to a value via the component: clicking the left half of star N yields `N - 0.5`, the right half yields `N`.

## 6. Review Actions

`src/reviews/actions.ts` (all derive `userId` from the session; reject if unauthenticated):
- `upsertRatingAction(wineId, rating)` — snaps the rating, upserts the review row on `(userId, wineId)` setting `rating` (and `tastedAt = today` when the row is new), leaving `tastingNote` untouched. Used by the list quick-rate and the detail page's star input.
- `upsertReviewAction(formData)` — from the detail page: parses `wineId`, `rating`, `tastingNote`, `tastedAt`; upserts all fields on `(userId, wineId)`.

Both use Postgres `ON CONFLICT (user_id, wine_id) DO UPDATE`, revalidate the relevant paths, and never trust a client-supplied user id.

## 7. Query Extensions

- `listCellar(userId)` — LEFT JOIN `reviews` on `(reviews.wineId = wines.id AND reviews.userId = userId)`; add `rating` to each returned row (null when unrated). The `CellarBottle` type and `filterAndSort` gain a `rating` field and a `rating` sort key (rating desc, nulls last).
- `getWineWithBottles(userId, wineId)` — also return the user's `review` (rating, tastingNote, tastedAt) for that wine, or null.

## 8. UI

- **Cellar list** (`/cellar`): each row shows a compact interactive `StarRating` bound to `upsertRatingAction`. Unrated → 5 grey stars. A new **"Note"** sort option (rating desc). The heat badge and other controls stay.
- **Wine detail** (`/wine/[id]`): a "Mon avis" section — interactive `StarRating`, a tasting-note textarea, a `tastedAt` date (default today), and "Enregistrer" → `upsertReviewAction`. Shows the saved review when present.

## 9. Error Handling

- Any rating value is snapped to the valid set before storage (`snapRating`); out-of-range input can't reach the DB.
- Unrated wines render empty (grey) stars; no review row is required to view a wine.
- All actions are auth-gated; a forged `wineId` only ever writes the acting user's own review row (scoped by session `userId`).

## 10. Testing Strategy

- **Rating math:** `snapRating`, `starFills` — pure, unit-tested (TDD).
- **Filters/sorts:** extend `cellar-filters.test.ts` for the `rating` sort key (desc, nulls last).
- **Upsert:** the one-review-per-wine constraint + upsert verified at build/integration level (the actions are DB-backed; the unique constraint is the guard).
- **Component:** the `StarRating` half-star mapping is covered by the rating-math tests plus a light render check.
- **E2E (manual):** rate from the list, rate + write a note from the detail page, sort by rating.

## 11. UI / Design System

Uses the Marathon UI Kit. Stars use the terracotta accent (`--accent`) for filled/half and `--line` for empty, consistent with the cellar's existing palette.

## 12. Open Questions / Future

- A tasting log (multiple dated reviews per wine) could supersede the single-review model later if wanted.
- Community aggregation (average rating per catalog wine) remains a possible future layer.
