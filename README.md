# Winerr

Self-hosted wine-cellar tracking web app.

## Stack
Next.js 16 (App Router, standalone) · PostgreSQL · Drizzle ORM · Auth.js · Vitest. Package manager: **pnpm**.

## Develop
```bash
pnpm install
cp .env.example .env   # then fill in values
pnpm db:migrate        # requires a running Postgres (see compose.yaml)
pnpm dev
```

## Test
```bash
pnpm test
```

## Deploy
Built as a Docker image and run via Docker Compose (`compose.yaml`), managed through Komodo. Point a Komodo Stack at this repo — it reads `compose.yaml` by default. See `docs/superpowers/` for the design spec and implementation plan.

Migrations run automatically on server boot (`src/instrumentation.ts`), so a fresh deploy self-applies the schema — no manual `pnpm db:migrate` step is needed (that command remains available for local development).

## AI (per account)
Photo label identification, web enrichment, drink-window estimates and market
quotes run on **each user's own API keys**, configured in the app under
**Réglages** (`/settings`) — not via environment variables. Keys are stored
encrypted (AES-256-GCM derived from `AUTH_SECRET`).

- **Provider — Mistral (free, recommended in the EU):** get a free key at
  [console.mistral.ai](https://console.mistral.ai) (no card). Gemini is also
  supported but its free tier is unavailable for EU-served apps (paid in
  Europe); get a key at [Google AI Studio](https://aistudio.google.com).
- **Tavily** (free, no card — [tavily.com](https://tavily.com)): required for
  web enrichment and market quotes, together with a Mistral key.

Without keys, an account still works fully for manual entry and name search —
the photo/enrichment blocks link to `/settings` instead, and drink windows
show "—". Market quotes are shared catalog data: once any account has produced
a quote for a wine, every holder sees it. The background price refresher sweeps
per user, quoting each user's in-cellar wines with their own keys
(`PRICE_REFRESH_DAYS`, default 30, stays a global env setting).

## Registration whitelist (optional)
Set `REGISTER_EMAIL_WHITELIST` (comma-separated emails) to restrict who can
create an account. Unset or empty = open registration. Existing accounts and
login are never affected.
