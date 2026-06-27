# Winerr

Self-hosted wine-cellar tracking web app.

## Stack
Next.js 16 (App Router, standalone) · PostgreSQL · Drizzle ORM · Auth.js · Vitest. Package manager: **pnpm**.

## Develop
```bash
pnpm install
cp .env.example .env   # then fill in values
pnpm db:migrate        # requires a running Postgres (see docker-compose.yml)
pnpm dev
```

## Test
```bash
pnpm test
```

## Deploy
Built as a Docker image and run via Docker Compose (`docker-compose.yml`), managed through Komodo. See `docs/superpowers/` for the design spec and implementation plan.
