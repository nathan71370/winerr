# Whitelist + Per-Account AI Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registration restricted by an env email-whitelist, and ALL AI configuration (provider + keys) moved from instance env vars to per-account, AES-encrypted settings with a `/settings` page — including a per-user price scheduler.

**Architecture:** Pure TDD foundations (`isEmailAllowed`, `crypto.ts`), a new `user_settings` table (migration 0007) + `src/settings/` module (decrypting queries, upsert action, `/settings` page), then the env→`AIConfig` refactor across `src/ai/*`, `src/catalog/drink-window.ts`, `src/price/*` and their call sites, and finally the per-user scheduler + UI gates.

**Tech Stack:** unchanged (Next 16, Drizzle/PG16, Zod 4, Vitest, node:crypto).

**Reference:** spec `docs/superpowers/specs/2026-07-02-winerr-accounts-whitelist-ai-design.md`.

---

## Baseline notes for every task
- Work from `/Users/nathanmercier/Documents/Project/frontend/winerr` on branch `accounts-ai` (controller creates it). Commit signing DISABLED locally — plain `git commit`.
- STRICT baseline: `pnpm exec tsc --noEmit` **0 errors**, `pnpm lint` **0 problems**, `pnpm test` **140 green**, `pnpm build` OK — keep ALL clean after every task.
- `@` → `src`. Tests flat in `tests/*.test.ts`. READ every file you modify before editing.

## File structure
- Create `src/auth/whitelist.ts` (+test), `src/lib/crypto.ts` (+test).
- Modify `src/auth/actions.ts` (whitelist guard), `.env.example`.
- Modify `src/db/schema.ts` (+ generated `drizzle/0007_*.sql`).
- Create `src/settings/queries.ts`, `src/settings/actions.ts`, `src/app/settings/page.tsx`, `src/app/settings/SettingsForm.tsx`.
- Modify `src/ai/types.ts` (AIConfig), `src/ai/index.ts`, `src/ai/enrich.ts`, `src/price/lookup.ts`, `src/price/service.ts`, `src/catalog/drink-window.ts`, `src/cellar/add/identify-action.ts`, `src/cellar/add/enrich-action.ts`, `src/cellar/actions.ts`, `src/price/scheduler.ts`.
- Restructure `src/app/cellar/add/page.tsx` → thin server page + client `AddForm.tsx`.
- Modify `src/app/wine/[id]/page.tsx`, `src/app/cellar/page.tsx` (header link), adapted tests.

---

## Batch 1 — Pure foundations + whitelist

### Task 1.1: isEmailAllowed (TDD)

**Files:** Create `src/auth/whitelist.ts`; Test `tests/auth-whitelist.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect } from "vitest";
import { isEmailAllowed } from "@/auth/whitelist";

describe("isEmailAllowed", () => {
  it("is open when the whitelist is unset or empty", () => {
    expect(isEmailAllowed("a@b.fr", undefined)).toBe(true);
    expect(isEmailAllowed("a@b.fr", "")).toBe(true);
    expect(isEmailAllowed("a@b.fr", " , ,")).toBe(true);
  });
  it("matches case-insensitively and trims whitespace", () => {
    const wl = " Alice@Mail.com , bob@mail.com ";
    expect(isEmailAllowed("alice@mail.com", wl)).toBe(true);
    expect(isEmailAllowed("  BOB@MAIL.COM  ", wl)).toBe(true);
  });
  it("refuses an email not on the list", () => {
    expect(isEmailAllowed("eve@mail.com", "alice@mail.com,bob@mail.com")).toBe(false);
  });
});
```
- [ ] **Step 2:** Run `pnpm exec vitest run tests/auth-whitelist.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement**
```ts
// src/auth/whitelist.ts
// Registration whitelist. Unset/empty env → open registration (opt-in
// restriction). Matching is case-insensitive and whitespace-tolerant.
export function isEmailAllowed(email: string, whitelistEnv: string | undefined | null): boolean {
  const list = (whitelistEnv ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true;
  return list.includes(email.trim().toLowerCase());
}
```
- [ ] **Step 4:** Run → PASS. **Step 5:** `git add src/auth/whitelist.ts tests/auth-whitelist.test.ts && git commit -m "feat(auth): pure registration email whitelist"`

### Task 1.2: crypto (TDD)

**Files:** Create `src/lib/crypto.ts`; Test `tests/crypto.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

beforeAll(() => { process.env.AUTH_SECRET = "test-secret-for-crypto"; });

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret", () => {
    const payload = encryptSecret("sk-abc-123");
    expect(payload).not.toContain("sk-abc-123");
    expect(decryptSecret(payload)).toBe("sk-abc-123");
  });
  it("uses a fresh IV each time (distinct payloads, same plain)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });
  it("returns null on tampered or garbage payloads", () => {
    const payload = encryptSecret("secret");
    const [iv, tag, data] = payload.split(":");
    const tampered = `${iv}:${tag}:${Buffer.from("xxxx").toString("base64")}${data.slice(4)}`;
    expect(decryptSecret(tampered)).toBeNull();
    expect(decryptSecret("not-a-payload")).toBeNull();
  });
});
```
- [ ] **Step 2:** Run → FAIL. **Step 3: Implement**
```ts
// src/lib/crypto.ts
// Secrets-at-rest encryption for user API keys: AES-256-GCM with a key derived
// from AUTH_SECRET (checked at boot in instrumentation.ts). Payload format:
// base64(iv):base64(authTag):base64(ciphertext). decryptSecret returns null on
// any tamper/garbage — callers treat that as "no key configured".
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

function derivedKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return scryptSync(secret, "winerr-settings-v1", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string | null {
  try {
    const [iv, tag, data] = payload.split(":").map((p) => Buffer.from(p, "base64"));
    if (!iv?.length || !tag?.length || !data) return null;
    const decipher = createDecipheriv("aes-256-gcm", derivedKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
```
- [ ] **Step 4:** Run → PASS. **Step 5:** `git add src/lib/crypto.ts tests/crypto.test.ts && git commit -m "feat(settings): AES-256-GCM secret encryption derived from AUTH_SECRET"`

### Task 1.3: whitelist guard + env docs

**Files:** Modify `src/auth/actions.ts`, `.env.example`

- [ ] **Step 1:** READ `src/auth/actions.ts`. In `registerAction`, AFTER the zod parse succeeds and BEFORE any DB work, add (matching the file's existing error-return idiom):
```ts
  if (!isEmailAllowed(parsed.data.email, process.env.REGISTER_EMAIL_WHITELIST)) {
    return { error: "Cette adresse n'est pas autorisée à s'inscrire." };
  }
```
(+ `import { isEmailAllowed } from "@/auth/whitelist";`)
- [ ] **Step 2:** Append to `.env.example`:
```
# Registration whitelist: comma-separated emails allowed to register.
# Unset or empty = open registration.
REGISTER_EMAIL_WHITELIST=
```
- [ ] **Step 3:** Gates (tsc 0 / lint 0 / test green / build OK). **Step 4:** `git add src/auth/actions.ts .env.example && git commit -m "feat(auth): registration email whitelist guard"`

---

## Batch 2 — Settings layer

### Task 2.1: user_settings schema (migration 0007)

**Files:** Modify `src/db/schema.ts`; Create `drizzle/0007_*.sql` (generated)

- [ ] **Step 1:** Append to `src/db/schema.ts`:
```ts
export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  aiProvider: text("ai_provider").notNull().default("mistral"),
  mistralApiKey: text("mistral_api_key"),
  geminiApiKey: text("gemini_api_key"),
  tavilyApiKey: text("tavily_api_key"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```
(Key columns hold ENCRYPTED payloads. Plain `text` provider — validation constrains the values; no new pg enum.)
- [ ] **Step 2:** `pnpm db:generate` → `drizzle/0007_*.sql` with `CREATE TABLE "user_settings"` + FK cascade. Gates. Commit: `git add src/db/schema.ts drizzle/ && git commit -m "feat(settings): user_settings table (migration 0007)"`

### Task 2.2: settings queries + action

**Files:** Create `src/settings/queries.ts`, `src/settings/actions.ts`; Modify `src/lib/validation.ts`

- [ ] **Step 1: `src/settings/queries.ts`**
```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import type { AIConfig } from "@/ai/types";

// The user's decrypted AI config, or null when nothing usable is configured.
// A decryption failure (e.g. AUTH_SECRET changed) degrades to "not configured".
export async function getUserAIConfig(userId: string): Promise<AIConfig | null> {
  const row = (await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1))[0];
  if (!row) return null;
  const config: AIConfig = {
    provider: row.aiProvider === "gemini" ? "gemini" : "mistral",
    mistralApiKey: row.mistralApiKey ? decryptSecret(row.mistralApiKey) : null,
    geminiApiKey: row.geminiApiKey ? decryptSecret(row.geminiApiKey) : null,
    tavilyApiKey: row.tavilyApiKey ? decryptSecret(row.tavilyApiKey) : null,
  };
  return config.mistralApiKey || config.geminiApiKey || config.tavilyApiKey ? config : null;
}

// Which keys are configured (booleans only — never echoes values). For the form.
export async function getSettingsState(userId: string) {
  const row = (await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1))[0];
  return {
    provider: row?.aiProvider === "gemini" ? ("gemini" as const) : ("mistral" as const),
    hasMistral: !!row?.mistralApiKey,
    hasGemini: !!row?.geminiApiKey,
    hasTavily: !!row?.tavilyApiKey,
  };
}
```
(NOTE: `AIConfig` lands in `src/ai/types.ts` in Task 3.1 — if implementing in plan order, define it there FIRST or inline-define then re-export; simplest: Batch 3 Task 3.1 may be done before this compiles — the controller sequences Batch 2 and 3 together; if compiling standalone, add the `AIConfig` type to `src/ai/types.ts` as part of THIS task with the exact shape from the spec.)
- [ ] **Step 2: `src/lib/validation.ts`** — append:
```ts
export const settingsSchema = z.object({
  aiProvider: z.enum(["mistral", "gemini"]),
  mistralApiKey: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  geminiApiKey: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  tavilyApiKey: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  clearMistral: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  clearGemini: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  clearTavily: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});
```
- [ ] **Step 3: `src/settings/actions.ts`**
```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { requireUserId } from "@/auth/require-user";
import { settingsSchema } from "@/lib/validation";
import { encryptSecret } from "@/lib/crypto";

// Upsert the user's AI settings. Semantics per key: filled field → replace
// (encrypted); "clear" checked → remove; empty field → keep the existing key.
export async function saveSettingsAction(_prev: unknown, formData: FormData) {
  const userId = await requireUserId();
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Réglages invalides." };
  const d = parsed.data;

  const enc = (v: string | undefined) => (v ? encryptSecret(v.trim()) : undefined);
  const patch: Record<string, unknown> = { aiProvider: d.aiProvider, updatedAt: new Date() };
  if (d.clearMistral) patch.mistralApiKey = null; else if (enc(d.mistralApiKey)) patch.mistralApiKey = enc(d.mistralApiKey);
  if (d.clearGemini) patch.geminiApiKey = null; else if (enc(d.geminiApiKey)) patch.geminiApiKey = enc(d.geminiApiKey);
  if (d.clearTavily) patch.tavilyApiKey = null; else if (enc(d.tavilyApiKey)) patch.tavilyApiKey = enc(d.tavilyApiKey);

  await db
    .insert(userSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: userSettings.userId, set: patch });

  revalidatePath("/settings");
  return { ok: true };
}
```
(NOTE the double-encrypt in `else if (enc(...)) patch.x = enc(...)` would encrypt twice with different IVs — fine but wasteful; implementer: hoist to a local `const v = enc(d.mistralApiKey); if (v) patch.mistralApiKey = v;` per key.)
- [ ] **Step 4:** Gates. Commit: `git add src/settings/ src/lib/validation.ts src/ai/types.ts && git commit -m "feat(settings): encrypted per-user AI config (queries + upsert action)"`

### Task 2.3: /settings page + header link

**Files:** Create `src/app/settings/page.tsx`, `src/app/settings/SettingsForm.tsx`; Modify `src/app/cellar/page.tsx`

- [ ] **Step 1: `SettingsForm.tsx`** (client): `useActionState(saveSettingsAction, null)`; provider radio/segmented control with the REQUIRED labels — **« Mistral — gratuit (console.mistral.ai, sans carte) »** and **« Gemini — payant en Europe (tier gratuit indisponible en UE) »**; three password inputs (`autoComplete="off"`, placeholder « Clé configurée ✓ — laisser vide pour conserver » when configured, plain placeholder otherwise); a small "Effacer" checkbox per configured key (names `clearMistral`/`clearGemini`/`clearTavily`); Tavily field labeled « Clé Tavily — gratuite, sans carte (app.tavily.com) — requise pour l'enrichissement web et les cotes »; success/error message via state (aria-live="polite"); note « Tes clés restent sur ton serveur, chiffrées. ». Marathon inline-token styles like `EditBottleForm`.
- [ ] **Step 2: `page.tsx`** (server): `requireUserId()` → `getSettingsState(userId)` → header (« Réglages », back-link `/cellar`) + `<SettingsForm state={...} />`.
- [ ] **Step 3:** In `src/app/cellar/page.tsx` header actions, add `<a href="/settings" style={{ fontSize: "var(--t-small)" }}>Réglages</a>` before « Ma cave (3D) ».
- [ ] **Step 4:** Gates + `pnpm build` (route `/settings` present). Commit: `git add src/app/settings/ src/app/cellar/page.tsx && git commit -m "feat(settings): /settings page — provider + encrypted keys"`

---

## Batch 3 — AI refactor (env → AIConfig)

### Task 3.1: AIConfig + factory

**Files:** Modify `src/ai/types.ts`, `src/ai/index.ts`; adapt `tests/ai-provider.test.ts`

- [ ] **Step 1:** Add to `src/ai/types.ts` (if not already added in Task 2.2):
```ts
export type AIConfig = {
  provider: "mistral" | "gemini";
  mistralApiKey?: string | null;
  geminiApiKey?: string | null;
  tavilyApiKey?: string | null;
};
```
- [ ] **Step 2:** READ `src/ai/index.ts` + `tests/ai-provider.test.ts`. Rewrite the factory: `getAIProvider(config: AIConfig | null): AIProvider | null` — null config → null; provider "gemini" + geminiApiKey → `createGeminiProvider({ apiKey: config.geminiApiKey, ... })`; provider "mistral" + mistralApiKey → `createMistralProvider({ apiKey: config.mistralApiKey, ... })`; missing matching key → null. `isAIEnabled(config)` = `getAIProvider(config) !== null`. Model names: keep optional env overrides IF the current factory has them, else internal constants (`pixtral-12b-latest`, current gemini default) — NO key/provider env reads remain. Adapt the provider tests to pass configs (no env mutation).
- [ ] **Step 3:** Gates (other call sites will now fail tsc — THIS task must be committed together with 3.2/3.3 if needed; preferred: do 3.1–3.3 as one working session with separate commits at each green point; if tsc can't be green after 3.1 alone because call sites pass no args, FIX the call sites in the same commit series before running gates — the batch is one dispatch).
- [ ] **Step 4:** Commit when green: `git add -A && git commit -m "feat(ai): provider factory takes explicit AIConfig"`

### Task 3.2: enrichWine + lookupPrice + hasQuoteKeys

**Files:** Modify `src/ai/enrich.ts`, `src/price/lookup.ts`, `src/price/service.ts`; adapt `tests/price-lookup.test.ts`

- [ ] **Step 1:** `enrichWine(input, config: AIConfig)`: replace the two env reads with `config.tavilyApiKey` / `config.mistralApiKey` (guard both). `MISTRAL_MODEL` env → keep as optional env override or constant (match 3.1's choice).
- [ ] **Step 2:** `lookupPrice(wine, config: AIConfig, fetchFn = fetch)`: same replacement. Update `tests/price-lookup.test.ts`: pass a config object instead of mutating `process.env` (drop the env save/restore).
- [ ] **Step 3:** In `src/price/service.ts`: replace `isPriceEnabled()` with:
```ts
export function hasQuoteKeys(config: AIConfig | null): config is AIConfig {
  return Boolean(config?.tavilyApiKey && config?.mistralApiKey);
}
```
`refreshWinePrice(wineId, config: AIConfig)`: drop the env gate (callers gate via `hasQuoteKeys`), pass config to `lookupPrice`. Grep for remaining `isPriceEnabled` imports — they're fixed in 3.3/4.x.
- [ ] **Step 4:** Commit when green: `git add -A && git commit -m "feat(ai): enrich + price lookup take explicit config"`

### Task 3.3: drink-window + call sites

**Files:** Modify `src/catalog/drink-window.ts`, `src/cellar/add/identify-action.ts`, `src/cellar/add/enrich-action.ts`, `src/cellar/actions.ts`

- [ ] **Step 1:** `refreshDrinkWindow(wineId, config: AIConfig | null)`: `getAIProvider(config)` instead of env.
- [ ] **Step 2:** READ both add actions. Each: `const config = await getUserAIConfig(userId);` (they already resolve userId via auth — keep that); null config (or missing needed keys) → return their existing error shape with `"Configure tes clés IA dans les réglages."`; pass config to `getAIProvider`/`enrichWine`.
- [ ] **Step 3:** `addBottleAction`: load `const aiConfig = await getUserAIConfig(userId);` once after `requireUserId()`; pass to `void refreshDrinkWindow(wineId, aiConfig);` and inside the fire-and-forget chain `await refreshWinePrice(wineId, aiConfig)` guarded by `hasQuoteKeys(aiConfig)` (skip the call otherwise; the seed insert stays unconditional when `marketPriceEur` present).
- [ ] **Step 4:** Full gates (this is where everything must compile again: grep repo-wide for `process.env.MISTRAL_API_KEY|GEMINI_API_KEY|TAVILY_API_KEY|AI_PROVIDER` in `src/` → ZERO hits). Remove those vars from `.env.example`. Commit: `git add -A && git commit -m "feat(ai): all AI call sites use the acting user's config"`

---

## Batch 4 — Scheduler + UI gates + verification

### Task 4.1: per-user scheduler

**Files:** Modify `src/price/scheduler.ts`, `src/instrumentation.ts`

- [ ] **Step 1:** Rewrite `sweep()`: lazy imports; `const rows = await db.select({ userId: userSettings.userId }).from(userSettings);` → for each userId: `const config = await getUserAIConfig(userId); if (!hasQuoteKeys(config)) continue;` → that user's DISTINCT in-cellar wineIds → `latestSnapshots` → `needsRefresh` filter → `slice(0, MAX_PER_SWEEP)` (25 **per user**) → sequential `refreshWinePrice(wineId, config)` + 3 s pause. Keep the try/catch never-throw, cadence constants, and `started` flag. `startPriceScheduler()` loses its `isPriceEnabled()` gate (always starts; comment why).
- [ ] **Step 2:** `src/instrumentation.ts`: no change needed beyond what exists (scheduler already started unconditionally after the gate removal — verify).
- [ ] **Step 3:** Gates. Commit: `git add -A && git commit -m "feat(price): per-user quote sweeps with each user's keys"`

### Task 4.2: UI gates (add page restructure + wine page)

**Files:** Restructure `src/app/cellar/add/` (server `page.tsx` + client `AddForm.tsx`); Modify `src/app/wine/[id]/page.tsx`

- [ ] **Step 1:** READ `src/app/cellar/add/page.tsx` (currently a client page). Move its entire content to `src/app/cellar/add/AddForm.tsx` (`"use client"`, same code, new prop `ai: { canIdentify: boolean; canEnrich: boolean }`). New thin server `page.tsx`: `requireUserId()` → `getUserAIConfig(userId)` → `canIdentify = isAIEnabled(config)`, `canEnrich = hasQuoteKeys(config)` (enrichment needs tavily+mistral) → `<AddForm ai={...} />`.
- [ ] **Step 2:** In `AddForm`, gate the photo/identify block on `ai.canIdentify` and the « Enrichir depuis le web » control on `ai.canEnrich`; when gated, render instead: `<p>… <Link href="/settings">Configure tes clés IA dans Réglages</Link> pour l'ajout par photo et l'enrichissement.</p>` (one message when both are off). Name-search + manual entry stay untouched.
- [ ] **Step 3:** `src/app/wine/[id]/page.tsx`: replace the `isPriceEnabled()` display logic — `const viewerConfig = await getUserAIConfig(session.user.id); const canQuote = hasQuoteKeys(viewerConfig);` — snapshot exists → block shown (unchanged); no snapshot → « Cote en attente » only when `canQuote`, else NO block. The cellar banner logic in `src/app/cellar/page.tsx`: drop its `isPriceEnabled()` gate — always compute from snapshots (shared data).
- [ ] **Step 4:** Full gates + build (route `/cellar/add` becomes ƒ dynamic — expected). Commit: `git add -A && git commit -m "feat(ui): AI affordances gated per user config"`

### Task 4.3: Full verification

- [ ] `pnpm test` all green (140 + whitelist + crypto tests); `tsc` 0; `lint` 0; `pnpm build` OK.
- [ ] Greps: zero `process.env.(AI_PROVIDER|MISTRAL_API_KEY|GEMINI_API_KEY|TAVILY_API_KEY)` in src/; zero `isPriceEnabled` references remain.
- [ ] Manual smoke (dev DB): register blocked/allowed per whitelist; `/settings` saves + shows ✓ without echoing; add page gated without keys, full with keys; scheduler logs per-user sweep; wine page states.
- [ ] `git add -A && git commit -m "fix: accounts smoke fixes" || echo clean`

## Done when
Whitelist enforces registration; every AI feature runs on the acting user's encrypted keys; the scheduler sweeps per user; no AI env vars remain; all gates fully green.
