# Winerr — Web Enrichment (Tavily + Mistral) + Bottle Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** After a photo identifies a wine, automatically enrich it from the web (region, country, grapes, description, drink window, market price) and persist + display a bottle image — so the user just reviews and saves (purchase price pre-filled from the found market price).

**Architecture:** A Tavily search client + a Mistral JSON-extraction step turn `{producer, cuvée, vintage}` into structured enrichment fields (2-step pattern: Tavily free text → Mistral extracts JSON). The uploaded (downscaled) photo is stored per wine as base64 in a `wine_images` table and served via a route handler; the cellar list and wine detail render `<img>` from that route (placeholder when absent). Everything degrades gracefully without keys.

**Tech Stack:** Next.js 16, Drizzle, zod, Vitest. New env: `TAVILY_API_KEY` (free, no card). Reuses `MISTRAL_API_KEY`. No new npm deps (plain `fetch`).

**Builds on:** the AI layer (`src/ai/`), the add flow (`src/app/cellar/add/page.tsx`, `identify-action.ts`, `src/cellar/actions.ts` `addBottleAction`), `src/cellar/queries.ts`, `src/app/cellar/page.tsx`, `src/app/wine/[id]/page.tsx`.

---

## Part 1 — Bottle image storage + display

### Task 1: `wine_images` table
**Files:** `src/db/schema.ts`, `drizzle/0003_*.sql`
- [ ] Add table:
```ts
export const wineImages = pgTable("wine_images", {
  wineId: uuid("wine_id").primaryKey().references(() => wines.id, { onDelete: "cascade" }),
  data: text("data").notNull(),   // base64-encoded image bytes
  mime: text("mime").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```
- [ ] `DATABASE_URL=postgres://x:x@localhost:5432/x pnpm db:generate` → `0003_*` (additive). `pnpm build`. Commit `feat(db): add wine_images table`.

### Task 2: image store + route
**Files:** create `src/images/store.ts`, `src/app/api/wine-image/[wineId]/route.ts`
- [ ] `src/images/store.ts`:
```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { wineImages } from "@/db/schema";

export async function setWineImage(wineId: string, base64: string, mime: string): Promise<void> {
  await db.insert(wineImages).values({ wineId, data: base64, mime })
    .onConflictDoUpdate({ target: wineImages.wineId, set: { data: base64, mime } });
}
export async function getWineImage(wineId: string): Promise<{ data: string; mime: string } | null> {
  const r = (await db.select({ data: wineImages.data, mime: wineImages.mime })
    .from(wineImages).where(eq(wineImages.wineId, wineId)).limit(1))[0];
  return r ?? null;
}
```
- [ ] `src/app/api/wine-image/[wineId]/route.ts` (a 1×1 transparent PNG placeholder when absent so `<img>` never breaks):
```ts
import { getWineImage } from "@/images/store";

const PLACEHOLDER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function GET(_req: Request, ctx: { params: Promise<{ wineId: string }> }) {
  const { wineId } = await ctx.params;
  const img = await getWineImage(wineId).catch(() => null);
  if (!img) {
    return new Response(PLACEHOLDER, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  }
  return new Response(Buffer.from(img.data, "base64"), {
    headers: { "content-type": img.mime, "cache-control": "public, max-age=300" },
  });
}
```
- [ ] `pnpm build`. Commit `feat(images): store + serve wine images`.

### Task 3: persist the uploaded photo on add
**Files:** `src/app/cellar/add/page.tsx`, `src/cellar/actions.ts`
- [ ] In the add page, the photo is already downscaled to base64 in `onPhoto`. Keep that base64 in state and submit it: add `const [photoB64, setPhotoB64] = useState("")`, set it in `onPhoto` (`setPhotoB64(base64)`), and add hidden inputs in the form: `<input type="hidden" name="imageB64" value={photoB64} />` and `<input type="hidden" name="imageMime" value="image/jpeg" />` (the downscaler always emits JPEG).
- [ ] In `addBottleAction` (`src/cellar/actions.ts`), AFTER `const wineId = await ensureWine(...)` and BEFORE the cellarItems insert, persist the image if present:
```ts
  const imageB64 = formData.get("imageB64");
  const imageMime = formData.get("imageMime");
  if (typeof imageB64 === "string" && imageB64.length > 0 && typeof imageMime === "string") {
    const { setWineImage } = await import("@/images/store");
    await setWineImage(wineId, imageB64, imageMime);
  }
```
- [ ] `pnpm build`. Commit `feat(cellar): persist uploaded photo as the wine image`.

### Task 4: show the image in the list + detail
**Files:** `src/app/cellar/page.tsx`, `src/app/wine/[id]/page.tsx`
- [ ] Cellar list: inside each bottle `<li>`, before the text block, render a thumbnail:
```tsx
              <img src={`/api/wine-image/${b.wineId}`} alt="" width={40} height={54}
                style={{ objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", marginRight: "var(--s-3)", background: "var(--cream-deep)" }} />
```
(Wrap the existing left content + this image in a flex row; keep the actions on the right.)
- [ ] Wine detail: under the `<h1>`, add a larger image:
```tsx
      <img src={`/api/wine-image/${wine.id}`} alt="" width={120} height={160}
        style={{ objectFit: "cover", borderRadius: "var(--radius)", border: "1px solid var(--line)", background: "var(--cream-deep)", marginTop: "var(--s-3)" }} />
```
- [ ] `pnpm build`. Commit `feat(cellar): show bottle image in list and detail`.

---

## Part 2 — Tavily search + Mistral enrichment

### Task 5: enrichment schema (TDD)
**Files:** `src/ai/enrich-types.ts`, `tests/enrich-types.test.ts`
- [ ] Test that `wineEnrichmentSchema` tolerantly parses LLM output (grapes array→string, numeric strings coerced, all fields optional/nullable). Mirror the tolerant helpers already in `src/ai/types.ts` (reuse the same preprocess patterns: looseText, looseIntNullable, a `looseFloatNullable` for price).
- [ ] Implement `src/ai/enrich-types.ts`:
```ts
import { z } from "zod";
const looseText = z.preprocess((v) => {
  if (v == null) return null;
  if (Array.isArray(v)) { const s = v.filter(Boolean).map(String).join(", "); return s || null; }
  if (typeof v === "string") return v.trim() || null;
  return String(v);
}, z.string().nullable());
const looseInt = z.preprocess((v) => {
  if (v == null || v === "") return null;
  const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null;
}, z.number().int().nullable());
const looseFloat = z.preprocess((v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}, z.number().nullable());

export const wineEnrichmentSchema = z.object({
  region: looseText, country: looseText, grapes: looseText, description: looseText,
  drinkFrom: looseInt, drinkTo: looseInt, priceEur: looseFloat, imageUrl: looseText,
});
export type WineEnrichment = z.infer<typeof wineEnrichmentSchema>;
```
- [ ] red→green; commit `feat(ai): wine enrichment schema`.

### Task 6: Tavily client (TDD, injected fetch)
**Files:** `src/ai/tavily.ts`, `tests/ai-tavily.test.ts`
- [ ] `createTavilySearch({ apiKey, fetchFn? })` → `search(query, maxResults=5): Promise<{title,url,content}[]>` POSTing `https://api.tavily.com/search` with body `{ api_key, query, max_results, search_depth: "basic" }`, parsing `results[]`. Throw on non-ok. TDD with a fake fetch returning `{ results: [{title,url,content}] }`; assert URL/body/parse.
- [ ] commit `feat(ai): add Tavily search client`.

### Task 7: enrichWine (2-step: Tavily → Mistral extract)
**Files:** `src/ai/enrich.ts`
- [ ] `enrichWine(input: { producer: string; cuvee?: string|null; vintage?: number|null }): Promise<WineEnrichment | null>`:
  - if no `TAVILY_API_KEY` or no Mistral key (reuse the existing provider key check) → return null.
  - Build a query (`${producer} ${cuvee ?? ""} ${vintage ?? ""} vin région cépages prix`).
  - `tavilySearch` → concatenate the top results' `title + url + content` into a context string (cap length).
  - Call Mistral chat completions (reuse the existing Mistral REST shape — a text-only `/v1/chat/completions`, `response_format: {type:"json_object"}`) with a prompt: "À partir de ces extraits web, renvoie en JSON {region, country, grapes, description (2 phrases), drinkFrom (année), drinkTo (année), priceEur (nombre), imageUrl}. null si inconnu. Extraits: <context>". Parse → `wineEnrichmentSchema.parse`.
  - Wrap in try/catch; on any failure return null (never throw — enrichment is best-effort).
  - Build-verified (DB/network-backed; the schema is unit-tested in Task 5, Tavily in Task 6).
- [ ] commit `feat(ai): enrichWine (Tavily search + Mistral JSON extraction)`.

### Task 8: enrich server action
**Files:** `src/cellar/add/enrich-action.ts`
- [ ] auth-gated `enrichWineAction(producer, cuvee, vintage)` → `{ enrichment } | { error }`. Returns `{ error }` if unauthenticated or `enrichWine` returns null (no keys / nothing found). commit `feat(cellar): enrich-wine server action`.

---

## Part 3 — Wire enrichment into the add flow

### Task 9: auto-enrich + prefill after identification
**Files:** `src/app/cellar/add/page.tsx`
- [ ] After a successful `identifyLabelAction` in `onPhoto` (once `producer` is known), call `enrichWineAction(producer, cuvee, vintage)`; merge non-null enrichment fields into the form: `region`, `country`, `grapes` (only if currently empty), and pre-fill `purchasePrice` from `priceEur` (only if empty). Show a small status line. Keep manual editing fully available.
- [ ] Add an **"Enrichir depuis le web"** button (so the user can trigger it manually too, e.g. after typing the name without a photo): on click, call `enrichWineAction` with the current form fields and merge.
- [ ] `pnpm build` + `pnpm test`. commit `feat(cellar): auto-enrich the add form from the web`.

### Task 10: env docs
**Files:** `.env.example`, `README.md`
- [ ] Document `TAVILY_API_KEY` (free, no card, tavily.com) and that enrichment needs it + `MISTRAL_API_KEY`. commit `docs: document TAVILY_API_KEY`.

---

## Self-Review Notes
- Image stored as base64 text in Postgres (no compose/volume change — survives the existing pgdata volume, backed up with the DB; fine for small downscaled JPEGs). Served via a route with a transparent-PNG placeholder so `<img>` never breaks.
- Enrichment is a 2-step Tavily→Mistral pipeline (Mistral web search is paid; Tavily is the free path). Best-effort: returns null and degrades when keys are absent or nothing is found. `imageUrl` from the web is unreliable — the persisted uploaded photo is the reliable image; a future task can prefer a fetched product image when present.
- Price pre-fills the user's *purchase price* field from the found market price (editable) — it is NOT the Phase-4 cached market "cote".
- All new external calls use plain `fetch` with injected-fetch tests (no live network in CI). Live behaviour needs the user's TAVILY + MISTRAL keys, verified after deploy.
