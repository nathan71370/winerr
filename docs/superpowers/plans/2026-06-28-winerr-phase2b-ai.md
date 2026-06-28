# Winerr Phase 2B — AI (Gemini) + Add-by-Photo + Drink Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI layer (default Google Gemini) so a user can identify a wine by photographing its label and so each wine gets an AI-estimated drinking window — both behind a swappable provider interface, degrading gracefully when no API key is set.

**Architecture:** A provider-agnostic AI module (`src/ai/`) defines an `AIProvider` interface and a Gemini implementation that calls the Gemini REST `generateContent` endpoint with a JSON `responseSchema`, validated with zod. A factory returns the Gemini provider when `GEMINI_API_KEY` is set, else `null` (app stays usable: manual entry + name search). A photo server action identifies a label; the add page gains a photo method that pre-fills the form. A drink-window service caches an estimate on the `wines` row, refreshed (fire-and-forget) after a bottle is added.

**Tech Stack:** Next.js 16, Drizzle, zod, Vitest. No new dependencies — Gemini is called via `fetch` (injectable for tests).

**Builds on:** Phase 2A. Relevant existing files: `src/db/schema.ts` (`wines` has `drinkFrom`, `drinkTo`, `drinkWindowConfidence`, `drinkWindowSource`, `drinkWindowFetchedAt`), `src/cellar/actions.ts` (`addBottleAction`), `src/app/cellar/add/page.tsx`, `src/cellar/queries.ts` (`listCellar` already selects `drinkFrom`/`drinkTo`), `src/auth/config.ts` (`auth`). `.env.example` already stubs `AI_PROVIDER`/`GEMINI_API_KEY`.

**Roadmap (later):** Phase 2C — rich filters/sorts + drink-window heat display (z1→z5) + wine-detail page.

---

## File Structure

```
src/
├── ai/
│   ├── types.ts            # AIProvider interface + zod schemas (LabelExtraction, DrinkWindow)
│   ├── gemini.ts           # Gemini REST implementation (fetch injectable)
│   └── index.ts            # getAIProvider() / isAIEnabled() factory by env
├── catalog/
│   └── drink-window.ts     # needsDrinkWindow (pure) + refreshDrinkWindow (DB-backed)
├── cellar/
│   ├── actions.ts          # MODIFY: fire-and-forget refreshDrinkWindow after add
│   └── add/
│       └── identify-action.ts   # auth-gated photo→extraction server action
└── app/cellar/
    ├── add/page.tsx        # MODIFY: photo upload method + confidence chip
    └── page.tsx            # MODIFY: minimal drink-window line in list
tests/
├── ai-types.test.ts
├── ai-gemini.test.ts
├── ai-provider.test.ts
└── drink-window.test.ts
```

---

## Task 1: AI types + schemas (TDD)

**Files:**
- Create: `src/ai/types.ts`
- Test: `tests/ai-types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ai-types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { labelExtractionSchema, drinkWindowSchema } from "@/ai/types";

describe("labelExtractionSchema", () => {
  it("accepts a full extraction", () => {
    const r = labelExtractionSchema.safeParse({
      producer: "Château Margaux", cuvee: null, vintage: 2015, region: "Margaux",
      country: "France", color: "rouge", grapes: "Cabernet Sauvignon", confidence: 0.9,
    });
    expect(r.success).toBe(true);
  });
  it("allows nulls for unknown fields but requires confidence", () => {
    const r = labelExtractionSchema.safeParse({
      producer: null, cuvee: null, vintage: null, region: null,
      country: null, color: null, grapes: null, confidence: 0.2,
    });
    expect(r.success).toBe(true);
  });
  it("rejects a bad color", () => {
    const r = labelExtractionSchema.safeParse({
      producer: "X", cuvee: null, vintage: null, region: null,
      country: null, color: "purple", grapes: null, confidence: 0.5,
    });
    expect(r.success).toBe(false);
  });
});

describe("drinkWindowSchema", () => {
  it("accepts from/to/confidence", () => {
    expect(drinkWindowSchema.safeParse({ from: 2026, to: 2032, confidence: 0.7 }).success).toBe(true);
  });
  it("rejects a missing field", () => {
    expect(drinkWindowSchema.safeParse({ from: 2026, to: 2032 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/ai-types.test.ts`
Expected: FAIL — cannot resolve `@/ai/types`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ai/types.ts`:
```ts
import { z } from "zod";

export const labelExtractionSchema = z.object({
  producer: z.string().nullable(),
  cuvee: z.string().nullable(),
  vintage: z.number().int().nullable(),
  region: z.string().nullable(),
  country: z.string().nullable(),
  color: z.enum(["rouge", "blanc", "rose", "effervescent"]).nullable(),
  grapes: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type LabelExtraction = z.infer<typeof labelExtractionSchema>;

export const drinkWindowSchema = z.object({
  from: z.number().int(),
  to: z.number().int(),
  confidence: z.number().min(0).max(1),
});
export type DrinkWindow = z.infer<typeof drinkWindowSchema>;

export type WineForWindow = {
  producer: string | null;
  cuvee: string | null;
  vintage: number | null;
  region: string | null;
  color: string | null;
  grapes: string | null;
};

export interface AIProvider {
  identifyLabel(imageBase64: string, mimeType: string): Promise<LabelExtraction>;
  estimateDrinkWindow(wine: WineForWindow): Promise<DrinkWindow | null>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/ai-types.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ai/types.ts tests/ai-types.test.ts
git commit -m "feat(ai): add provider interface and extraction/drink-window schemas"
```

---

## Task 2: Gemini provider (TDD with injected fetch)

**Files:**
- Create: `src/ai/gemini.ts`
- Test: `tests/ai-gemini.test.ts`

The provider takes an injectable `fetchFn` so the request-building and response-mapping are testable with a fake — no network in tests.

- [ ] **Step 1: Write the failing test**

Create `tests/ai-gemini.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createGeminiProvider } from "@/ai/gemini";

function fakeFetch(payload: unknown, ok = true, status = 200) {
  return vi.fn(async () =>
    ({ ok, status, json: async () => payload }) as unknown as Response);
}

const labelPayload = {
  candidates: [{ content: { parts: [{ text: JSON.stringify({
    producer: "Château Margaux", cuvee: null, vintage: 2015, region: "Margaux",
    country: "France", color: "rouge", grapes: "Cabernet Sauvignon", confidence: 0.9,
  }) }] } }],
};

describe("createGeminiProvider.identifyLabel", () => {
  it("posts to the model endpoint with the api key and parses the JSON candidate", async () => {
    const fetchFn = fakeFetch(labelPayload);
    const p = createGeminiProvider({ apiKey: "KEY123", model: "gemini-2.0-flash", fetchFn });
    const out = await p.identifyLabel("BASE64DATA", "image/jpeg");
    expect(out.producer).toBe("Château Margaux");
    expect(out.vintage).toBe(2015);
    const url = (fetchFn.mock.calls[0][0] as string);
    expect(url).toContain("gemini-2.0-flash:generateContent");
    expect(url).toContain("key=KEY123");
    const body = JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.contents[0].parts.some((pt: { inlineData?: unknown }) => pt.inlineData)).toBe(true);
  });

  it("throws on a non-ok response", async () => {
    const p = createGeminiProvider({ apiKey: "K", fetchFn: fakeFetch({}, false, 429) });
    await expect(p.identifyLabel("x", "image/jpeg")).rejects.toThrow();
  });
});

describe("createGeminiProvider.estimateDrinkWindow", () => {
  it("returns a parsed window", async () => {
    const payload = { candidates: [{ content: { parts: [{ text: JSON.stringify({ from: 2026, to: 2032, confidence: 0.7 }) }] } }] };
    const p = createGeminiProvider({ apiKey: "K", fetchFn: fakeFetch(payload) });
    const w = await p.estimateDrinkWindow({ producer: "X", cuvee: null, vintage: 2015, region: "Margaux", color: "rouge", grapes: null });
    expect(w).toEqual({ from: 2026, to: 2032, confidence: 0.7 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/ai-gemini.test.ts`
Expected: FAIL — cannot resolve `@/ai/gemini`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ai/gemini.ts`:
```ts
import {
  labelExtractionSchema,
  drinkWindowSchema,
  type AIProvider,
  type WineForWindow,
} from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
type FetchFn = typeof fetch;

const LABEL_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    producer: { type: "string", nullable: true },
    cuvee: { type: "string", nullable: true },
    vintage: { type: "integer", nullable: true },
    region: { type: "string", nullable: true },
    country: { type: "string", nullable: true },
    color: { type: "string", enum: ["rouge", "blanc", "rose", "effervescent"], nullable: true },
    grapes: { type: "string", nullable: true },
    confidence: { type: "number" },
  },
  required: ["confidence"],
};

const WINDOW_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    from: { type: "integer" },
    to: { type: "integer" },
    confidence: { type: "number" },
  },
  required: ["from", "to", "confidence"],
};

export function createGeminiProvider(opts: {
  apiKey: string;
  model?: string;
  fetchFn?: FetchFn;
}): AIProvider {
  const model = opts.model ?? "gemini-2.0-flash";
  const doFetch = opts.fetchFn ?? fetch;

  async function call(body: unknown): Promise<unknown> {
    const res = await doFetch(`${ENDPOINT}/${model}:generateContent?key=${opts.apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Gemini error ${res.status}`);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini: empty response");
    return JSON.parse(text);
  }

  return {
    async identifyLabel(imageBase64, mimeType) {
      const raw = await call({
        contents: [
          {
            parts: [
              {
                text:
                  "Identifie ce vin à partir de la photo d'étiquette. Renvoie producer (domaine), cuvee, vintage (année en nombre), region, country, color parmi rouge|blanc|rose|effervescent, grapes (cépages), et confidence entre 0 et 1. Mets null pour tout champ inconnu.",
              },
              { inlineData: { mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: LABEL_RESPONSE_SCHEMA,
        },
      });
      return labelExtractionSchema.parse(raw);
    },

    async estimateDrinkWindow(wine: WineForWindow) {
      const raw = await call({
        contents: [
          {
            parts: [
              {
                text:
                  "Estime la fenêtre de dégustation optimale (en années) pour ce vin, en raisonnant par cépage, région et millésime. Renvoie from (année), to (année), confidence entre 0 et 1.\nVin: " +
                  JSON.stringify(wine),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: WINDOW_RESPONSE_SCHEMA,
        },
      });
      return drinkWindowSchema.parse(raw);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/ai-gemini.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ai/gemini.ts tests/ai-gemini.test.ts
git commit -m "feat(ai): add Gemini REST provider (vision + drink window)"
```

---

## Task 3: Provider factory (TDD)

**Files:**
- Create: `src/ai/index.ts`
- Test: `tests/ai-provider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ai-provider.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { getAIProvider, isAIEnabled } from "@/ai";

const original = process.env.GEMINI_API_KEY;
afterEach(() => {
  if (original === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = original;
});

describe("AI provider factory", () => {
  it("is disabled and returns null when no key is set", () => {
    delete process.env.GEMINI_API_KEY;
    expect(isAIEnabled()).toBe(false);
    expect(getAIProvider()).toBeNull();
  });
  it("is enabled and returns a provider when a key is set", () => {
    process.env.GEMINI_API_KEY = "KEY";
    expect(isAIEnabled()).toBe(true);
    const p = getAIProvider();
    expect(p).not.toBeNull();
    expect(typeof p?.identifyLabel).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/ai-provider.test.ts`
Expected: FAIL — cannot resolve `@/ai`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ai/index.ts`:
```ts
import { createGeminiProvider } from "./gemini";
import type { AIProvider } from "./types";

export function isAIEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

// Returns the configured AI provider, or null when no key is set (the app
// stays usable: manual entry + name search; drink windows show "—").
export function getAIProvider(): AIProvider | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return createGeminiProvider({ apiKey, model: process.env.GEMINI_MODEL });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/ai-provider.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ai/index.ts tests/ai-provider.test.ts
git commit -m "feat(ai): add provider factory gated on GEMINI_API_KEY"
```

---

## Task 4: Drink-window service (TDD for the staleness rule)

**Files:**
- Create: `src/catalog/drink-window.ts`
- Test: `tests/drink-window.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/drink-window.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { needsDrinkWindow } from "@/catalog/drink-window";

const now = new Date("2026-06-28T00:00:00Z");

describe("needsDrinkWindow", () => {
  it("needs one when never computed (drinkFrom null)", () => {
    expect(needsDrinkWindow({ drinkFrom: null, drinkWindowFetchedAt: null }, now)).toBe(true);
  });
  it("needs one when there's a value but no fetched timestamp", () => {
    expect(needsDrinkWindow({ drinkFrom: 2026, drinkWindowFetchedAt: null }, now)).toBe(true);
  });
  it("does NOT need one when computed recently", () => {
    const recent = new Date("2026-06-01T00:00:00Z");
    expect(needsDrinkWindow({ drinkFrom: 2026, drinkWindowFetchedAt: recent }, now)).toBe(false);
  });
  it("needs a refresh when older than the staleness window", () => {
    const old = new Date("2025-01-01T00:00:00Z");
    expect(needsDrinkWindow({ drinkFrom: 2026, drinkWindowFetchedAt: old }, now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/drink-window.test.ts`
Expected: FAIL — cannot resolve `@/catalog/drink-window`.

- [ ] **Step 3: Write minimal implementation**

Create `src/catalog/drink-window.ts`:
```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { wines } from "@/db/schema";
import { getAIProvider } from "@/ai";

const STALE_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

// Pure: does this wine need its drink window (re)computed?
export function needsDrinkWindow(
  wine: { drinkFrom: number | null; drinkWindowFetchedAt: Date | null },
  now: Date,
): boolean {
  if (wine.drinkFrom == null) return true;
  if (!wine.drinkWindowFetchedAt) return true;
  return now.getTime() - wine.drinkWindowFetchedAt.getTime() > STALE_MS;
}

// Fire-and-forget: estimate + cache the drink window for a wine. No-op when the
// provider is unconfigured or the window is fresh. Never throws (logs instead).
export async function refreshDrinkWindow(wineId: string): Promise<void> {
  try {
    const provider = getAIProvider();
    if (!provider) return;
    const wine = (await db.select().from(wines).where(eq(wines.id, wineId)).limit(1))[0];
    if (!wine) return;
    if (!needsDrinkWindow(wine, new Date())) return;

    const w = await provider.estimateDrinkWindow({
      producer: wine.producer,
      cuvee: wine.cuvee,
      vintage: wine.vintage,
      region: wine.region,
      color: wine.color,
      grapes: wine.grapes,
    });
    if (!w) return;
    await db
      .update(wines)
      .set({
        drinkFrom: w.from,
        drinkTo: w.to,
        drinkWindowConfidence: String(w.confidence),
        drinkWindowSource: "gemini",
        drinkWindowFetchedAt: new Date(),
      })
      .where(eq(wines.id, wineId));
  } catch (e) {
    console.error("[drink-window] refresh failed", e);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/drink-window.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/catalog/drink-window.ts tests/drink-window.test.ts
git commit -m "feat(catalog): add drink-window estimate + cache service"
```

---

## Task 5: Photo identification server action

**Files:**
- Create: `src/cellar/add/identify-action.ts`

- [ ] **Step 1: Write the action**

Create `src/cellar/add/identify-action.ts`:
```ts
"use server";

import { auth } from "@/auth/config";
import { getAIProvider } from "@/ai";
import type { LabelExtraction } from "@/ai/types";

export type IdentifyResult = { extraction: LabelExtraction } | { error: string };

export async function identifyLabelAction(
  imageBase64: string,
  mimeType: string,
): Promise<IdentifyResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Non authentifié." };

  const provider = getAIProvider();
  if (!provider) return { error: "Identification IA non configurée (clé manquante). Saisis manuellement." };

  if (!imageBase64 || !mimeType.startsWith("image/")) {
    return { error: "Image invalide." };
  }

  try {
    const extraction = await provider.identifyLabel(imageBase64, mimeType);
    return { extraction };
  } catch (e) {
    console.error("[identify] failed", e);
    return { error: "Identification échouée. Saisis manuellement." };
  }
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/cellar/add/identify-action.ts
git commit -m "feat(cellar): add auth-gated photo identification action"
```

---

## Task 6: Add-page photo method

**Files:**
- Modify: `src/app/cellar/add/page.tsx`

Add a photo upload control above the form. On file select, read it as base64, call `identifyLabelAction`, and pre-fill the form fields from the extraction; show a confidence chip or an error.

- [ ] **Step 1: Wire the photo upload into the page**

In `src/app/cellar/add/page.tsx`, add the import near the other imports:
```ts
import { identifyLabelAction } from "./identify-action";
```

Add two state hooks inside the component, just after the existing `const [suggestions, setSuggestions] = useState<Suggestion[]>([]);` line:
```ts
  const [identifying, setIdentifying] = useState(false);
  const [identifyMsg, setIdentifyMsg] = useState<string | null>(null);
```

Add this handler inside the component, after the existing `pick` function:
```ts
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setIdentifyMsg(null);
    setIdentifying(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await identifyLabelAction(base64, file.type);
      if ("error" in res) {
        setIdentifyMsg(res.error);
        return;
      }
      const e = res.extraction;
      setForm((f) => ({
        ...f,
        producer: e.producer ?? f.producer,
        cuvee: e.cuvee ?? "",
        vintage: e.vintage != null ? String(e.vintage) : "",
        region: e.region ?? "",
        country: e.country ?? "",
        color: e.color ?? "rouge",
        grapes: e.grapes ?? "",
        lwinCode: "",
      }));
      setSuggestions([]);
      setIdentifyMsg(`Identifié (confiance ${(e.confidence * 100).toFixed(0)} %) — vérifie et corrige si besoin.`);
    } finally {
      setIdentifying(false);
    }
  }
```

Add this block in the returned JSX, immediately after the opening `<h1 ...>Ajouter une bouteille</h1>` line and before the `<form ...>`:
```tsx
      <div style={{ marginTop: "var(--s-4)", padding: "var(--s-4)", border: "1px dashed var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
        <label style={{ fontSize: "var(--t-small)", color: "var(--ink-soft)", cursor: "pointer" }}>
          📷 {identifying ? "Identification…" : "Photographier l'étiquette"}
          <input type="file" accept="image/*" capture="environment" disabled={identifying}
            onChange={(ev) => onPhoto(ev.target.files?.[0])} style={{ display: "block", marginTop: "var(--s-2)", fontSize: "var(--t-small)" }} />
        </label>
        {identifyMsg && <p style={{ marginTop: "var(--s-2)", fontSize: "var(--t-meta)", color: "var(--ink-mute)" }}>{identifyMsg}</p>}
      </div>
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/cellar/add/page.tsx
git commit -m "feat(cellar): add photo identification to the add form"
```

---

## Task 7: Wire drink-window refresh + show it in the list

**Files:**
- Modify: `src/cellar/actions.ts`
- Modify: `src/app/cellar/page.tsx`

- [ ] **Step 1: Trigger refresh after add (fire-and-forget)**

In `src/cellar/actions.ts`, add the import near the top (with the other `@/` imports):
```ts
import { refreshDrinkWindow } from "@/catalog/drink-window";
```

In `addBottleAction`, immediately AFTER the `await db.insert(cellarItems).values({...})` call and BEFORE `revalidatePath("/cellar")`, add:
```ts
  // Fire-and-forget: estimate the drink window for this wine if not cached.
  // refreshDrinkWindow never throws; we intentionally don't await it.
  void refreshDrinkWindow(wineId);
```

- [ ] **Step 2: Show a minimal drink-window line in the list**

In `src/app/cellar/page.tsx`, inside the bottle `<li>`, find the metadata `<div>` that renders `{b.region ?? "—"} · {b.color ?? "—"} · ×{b.quantity}...`. Immediately AFTER that closing `</div>`, add a drink-window line:
```tsx
                {b.drinkFrom && b.drinkTo && (
                  <div style={{ color: "var(--sage)", fontSize: "var(--t-meta)", marginTop: 2 }}>
                    À boire {b.drinkFrom}–{b.drinkTo}
                  </div>
                )}
```
(`b.drinkFrom`/`b.drinkTo` are already selected by `listCellar`.)

- [ ] **Step 3: Verify build & tests**

Run: `pnpm build && pnpm test`
Expected: build succeeds; all tests pass (Phase 2A tests + the new ai-types, ai-gemini, ai-provider, drink-window suites).

- [ ] **Step 4: Commit**

```bash
git add src/cellar/actions.ts src/app/cellar/page.tsx
git commit -m "feat(cellar): estimate drink window on add and show it in the list"
```

---

## Task 8: Document the AI env vars

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Update `.env.example`**

Ensure `.env.example` has (the AI block already exists from Phase 1 — update it to include the model and a comment):
```bash
# AI provider (Phase 2B). Leave GEMINI_API_KEY blank to disable AI features
# (manual entry + name search still work; drink windows show "—").
AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
```

- [ ] **Step 2: Add an AI note to `README.md`**

In `README.md`, add a short section after the Deploy section:
```markdown
## AI (optional)
Photo label identification and drink-window estimates use Google Gemini. Set
`GEMINI_API_KEY` (free tier from Google AI Studio) in the Stack environment to
enable them. Without a key, the app still works for manual entry and name search.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document Gemini AI env vars"
```

---

## Self-Review Notes

- **Spec coverage (2B portion):** AI provider interface + Gemini default (Tasks 1-3); `identifyLabel` photo path (Tasks 5-6); `estimateDrinkWindow` + caching on `wines` (Task 4) wired fire-and-forget after add (Task 7); graceful no-key degradation (factory returns null; identify-action + refreshDrinkWindow both no-op with a clear message). The rich drink-window heat display + filters/sorts + wine detail are intentionally Phase 2C — Task 7 adds only a minimal text line so 2B is demoable.
- **No placeholders:** every step ships concrete code/commands. Gemini is called via `fetch` (injected in tests) — no live network in the suite; the real call is exercised only when a key is configured.
- **Type consistency:** `AIProvider`/`LabelExtraction`/`DrinkWindow`/`WineForWindow` (Task 1) are used by `createGeminiProvider` (Task 2), `getAIProvider` (Task 3), `refreshDrinkWindow` (Task 4), and `identifyLabelAction` (Task 5). The extraction `color` enum (`rouge/blanc/rose/effervescent`) matches the add form + `addBottleSchema` from Phase 2A. `listCellar` already returns `drinkFrom`/`drinkTo` (used in Task 7).
- **Known follow-ups for 2C:** drink-window heat display (z1→z5) + "trop jeune / à boire / à boire avant" status buckets; persisting the user's uploaded photo (`my_photo`) needs the FS/MinIO storage layer (not built — identification here uses the image transiently); a background refresh pass for wines whose window is null/stale (currently only refreshed on add).
