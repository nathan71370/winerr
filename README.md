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

## AI (optional)
Photo label identification and drink-window estimates are powered by a swappable
AI provider. Select it with the `AI_PROVIDER` environment variable (`gemini` or
`mistral`; defaults to `gemini` when unset).

**EU users — use Mistral (recommended):** Gemini's free tier is unavailable in
the EU under Google's Terms of Service. Mistral is a French provider with a free
tier that is fully ToS-compliant in the EU.

- Set `AI_PROVIDER=mistral` and `MISTRAL_API_KEY=<your key>` (get a free key at
  [console.mistral.ai](https://console.mistral.ai)). The default vision model is
  `pixtral-12b-latest`; override with `MISTRAL_MODEL` if needed.

**Global / non-EU users:** Set `AI_PROVIDER=gemini` (or leave it unset) and
`GEMINI_API_KEY=<your key>` (free tier from
[Google AI Studio](https://aistudio.google.com)). Override the model with
`GEMINI_MODEL` (default: `gemini-2.0-flash`).

Without any key, the app still works fully for manual entry and name search;
drink windows simply show "—".

Web enrichment after a photo (or via the "Enrichir depuis le web" button) uses
Tavily (free, no card required — set `TAVILY_API_KEY` at
[tavily.com](https://tavily.com)) together with Mistral; it pre-fills
region, grapes, description, and purchase price, and stores a product image
when one is found.
