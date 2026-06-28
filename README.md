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
Photo label identification and drink-window estimates use Google Gemini. Set
`GEMINI_API_KEY` (free tier from Google AI Studio) in the Stack environment to
enable them. Without a key, the app still works for manual entry and name search.
