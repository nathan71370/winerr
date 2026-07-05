# Winerr — Registration Whitelist + Per-Account AI Keys (design)

**Date:** 2026-07-02
**Status:** Approved (brainstorm), pending implementation plan
**Context:** The instance is publicly exposed (winerr.limperiam.com). Two related account-layer features: (1) restrict who can register via an env whitelist; (2) move ALL AI configuration (provider + API keys) from instance env vars to per-account, encrypted settings — each user brings their own free-tier quotas.

## Part A — Registration whitelist

| Decision | Choice |
|---|---|
| Config | `REGISTER_EMAIL_WHITELIST` env var — comma-separated emails, case-insensitive, whitespace-trimmed. Documented in `.env.example`. |
| Unset/empty | **Registration OPEN** (backwards-compatible; restriction is opt-in). |
| Scope | Registration ONLY. Login/existing accounts are never affected. |
| Enforcement | Server-side in `registerAction` (`src/auth/actions.ts`), after zod validation: not allowed → `{ error: "Cette adresse n'est pas autorisée à s'inscrire." }` (rendered by the existing aria-live error paragraph). No UI change. |
| Logic | Pure `isEmailAllowed(email, whitelistEnv)` in `src/auth/whitelist.ts`, TDD: unset/empty → true; else strict membership of `email.trim().toLowerCase()` in the parsed list (split ",", trim, lowercase, drop empties). |

## Part B — Per-account AI configuration

### Locked decisions

| Decision | Choice |
|---|---|
| Model | **Per-account ONLY.** The env vars `AI_PROVIDER`, `MISTRAL_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `TAVILY_API_KEY` are removed from the code and `.env.example`. No account keys → AI features disabled for that account. (`MISTRAL_MODEL` becomes an internal constant.) |
| Storage | New `user_settings` table (migration 0007), keys **encrypted at rest** (AES-256-GCM, key derived from `AUTH_SECRET` via scrypt). |
| Scheduler | **Per-user sweeps**: for each user whose config has quote-capable keys (Tavily AND Mistral), refresh the stale wines currently in THEIR cellar with THEIR keys. Shared wines refreshed by one holder are skipped for the others by the existing staleness gate. |
| Quotes remain shared | `price_snapshots` stay catalog-level (mutualized). Keys are needed to PRODUCE quotes, never to VIEW them. |
| Provider labels | Settings UI must state: **Mistral — gratuit** (console.mistral.ai, sans carte) vs **Gemini — payant en Europe** (free tier unavailable for EU-served apps — the 429 we hit); Tavily key labeled « gratuite, sans carte ». |

### Data & crypto

- `user_settings`: `userId` uuid pk → users (cascade), `aiProvider` text ("mistral" | "gemini", default "mistral"), `mistralApiKey` text null, `geminiApiKey` text null, `tavilyApiKey` text null (all three stored ENCRYPTED), `updatedAt` timestamp. Migration 0007.
- `src/lib/crypto.ts` (TDD): `encryptSecret(plain)` / `decryptSecret(payload)` — AES-256-GCM via `node:crypto`; 32-byte key = `scryptSync(AUTH_SECRET, "winerr-settings", 32)`; random 12-byte IV; payload = `base64(iv):base64(tag):base64(ciphertext)`. Round-trip + tamper-rejection tested. The existing boot-time `AUTH_SECRET` fail-fast guarantees decryptability.
- `src/settings/queries.ts`: `getUserAIConfig(userId)` → decrypted `AIConfig | null` (null when no row or no usable key). `src/settings/actions.ts`: `saveSettingsAction` (user-scoped upsert; empty field = keep existing key; explicit clear control per key; encrypts before write).

### The AI refactor (env → explicit config)

Shared type in `src/ai/types.ts`:
```ts
export type AIConfig = {
  provider: "mistral" | "gemini";
  mistralApiKey?: string | null;
  geminiApiKey?: string | null;
  tavilyApiKey?: string | null;
};
```
Signature changes (no module reads AI env vars anymore):
- `getAIProvider(config)` / `isAIEnabled(config)` — factory selects by `config.provider` + matching key.
- `enrichWine(input, config)` — Tavily + Mistral keys from config. Web enrichment stays Mistral-only for extraction (a Gemini-only user gets photo identification but not web enrichment/quotes).
- `lookupPrice(wine, config, fetchFn?)`; quote capability = `config.tavilyApiKey && config.mistralApiKey` (helper `hasQuoteKeys(config)` replaces `isPriceEnabled()`).
- `refreshDrinkWindow(wineId, config)`, `refreshWinePrice(wineId, config)`.
- Call sites (all have user context): `identify-action` + `enrich-action` load `getUserAIConfig(userId)` and fail cleanly when null; `addBottleAction` loads it once and passes it through the fire-and-forget chain (seed → refreshWinePrice) and `refreshDrinkWindow`.
- Existing tests pass config as an argument instead of mutating `process.env` (cleaner).

### Scheduler (per-user)

`src/price/scheduler.ts` keeps its cadence (first sweep 60 s, every 6 h; `PRICE_REFRESH_DAYS` stays a GLOBAL instance policy). A sweep: load all `user_settings` → decrypt → keep quote-capable configs → for each user: their in-cellar wineIds → staleness filter → **cap 25 wines per user per sweep**, 3 s pause → `refreshWinePrice(wineId, thatUsersConfig)`. The scheduler now always starts (no boot gate); a sweep with no configured users does nothing.

### UI

- **`/settings` page** (protected, linked as « Réglages » in the cellar header): provider select (with the free/paid labels above), 3 password-type key fields showing a « configurée ✓ » state without ever echoing stored values, per-key clear control, note « tes clés restent sur ton serveur, chiffrées ».
- **Add page**: when the acting user has no AI config, the photo/enrichment block is replaced by a link « Configure tes clés IA dans Réglages » — name-search and manual add remain available.
- **Wine page**: snapshot exists → « Cote » block visible to everyone (±%, sparkline). No snapshot → « Cote en attente » only if the viewer is quote-capable; otherwise the block is hidden.
- **Cellar banner**: shown whenever quotes exist, regardless of the viewer's keys.

## Error handling

- No config where required → clean French error from actions (`"Configure tes clés IA dans les réglages."`), never a crash; UI pre-hides gated affordances.
- Decryption failure (e.g. AUTH_SECRET changed) → treat as no-config (log once), user re-enters keys.
- Whitelist: enforcement is server-side only (POSTing directly cannot bypass it).

## Testing (TDD for pure logic)

1. `isEmailAllowed` — unset/empty → open; membership with case/whitespace variants; non-listed → refused.
2. `crypto.ts` — round-trip, distinct IVs, tamper rejection, deterministic key from secret.
3. `hasQuoteKeys` / factory selection by config (adapt existing ai-provider tests).
4. Adapted suites: ai-gemini/mistral/tavily/enrich/price-lookup take config args (no env mutation).
5. Scheduler/actions: thin orchestration — manual smoke.

## Deploy notes (breaking for the current instance)

After this ships: the Komodo AI env vars stop doing anything — the user logs in, enters their keys once in `/settings`, then removes `AI_PROVIDER`/`MISTRAL_API_KEY`/`TAVILY_API_KEY` (+ any GEMINI vars) from Komodo. Keep: `AUTH_SECRET`, `DATABASE_URL`, `PRICE_REFRESH_DAYS`, and add `REGISTER_EMAIL_WHITELIST`. Migration 0007 applies on boot.

## Out of scope

Per-user AI models/config beyond provider+keys; sharing keys between accounts; admin UI for the whitelist (env-only by design); rotating the encryption salt; per-user `PRICE_REFRESH_DAYS`.
