# Winerr — MVP Design Spec

**Date:** 2026-06-27
**Status:** Approved (design phase)
**Author:** Nathan Mercier (with Claude)

## 1. Vision

Winerr is a **self-hosted, multi-user, web-responsive** application for tracking a personal wine collection. It turns the tedious parts of cellar management into an AI-assisted flow: you photograph a label, the app identifies the wine, tracks its market value automatically, and lets you record and rank your tasting impressions.

Everything runs on the user's own server via Docker, deployed and managed through **Komodo**. No external SaaS platform dependency (no Vercel). The only outbound dependency is a **free external LLM API**, isolated behind a swappable provider interface.

## 2. MVP Scope

Three features ship in the MVP:

1. **Cellar inventory** — add bottles primarily by AI label photo, with name search and manual entry as fallbacks. Track quantity, purchase info, and drink window.
2. **Personal reviews & ranking** — rate wines (5 stars, half-stars allowed), write tasting notes, sort and filter your own cellar.
3. **Automatic price tracking** — no manual price entry. An estimated market quote is fetched via external API / AI web search, mutualized and cached per wine+vintage, refreshed periodically by a cron job.

### Explicitly deferred (future layers)

- **3D cellar visualization** — the "wow" feature. Out of MVP scope. The data model reserves a `location` field on cellar items so the 3D layer can map bottles to physical slots later.
- Community/aggregated ratings, social features, barcode scanning, native mobile app.

### Non-goals

- Guaranteed/official pricing (quotes are estimates with a range).
- Manual price entry (deliberately excluded by user requirement).

## 3. Architecture

Self-hosted stack, all containers orchestrated by Komodo via Docker Compose.

| Layer | Choice | Notes |
|---|---|---|
| App | **Next.js** (standalone output) | Single container, UI + server logic (React Server Components, server actions, route handlers). |
| Database | **PostgreSQL** | Container. Users, catalog, bottles, reviews, price snapshots. |
| Auth | **Auth.js (NextAuth)** + Postgres adapter | Fully self-hosted. Email/password or OAuth. No SaaS. |
| Photo storage | **Local filesystem** (default) or **MinIO** (S3-compatible) | Configurable. Start with local FS; MinIO optional. |
| AI | **External free LLM API** behind a provider interface | Default **Google Gemini Flash** (free tier: vision + web-grounded search). Env-configured, swappable. |
| Scheduling | **Cron** (node-cron or system cron) | Periodic price refresh. |
| Orchestration | **Komodo → Docker Compose** | Builds from git, deploys the stack. |

### AI provider abstraction

The AI layer is an isolated module with a narrow, provider-agnostic interface. The rest of the app never knows which model runs behind it.

```
interface AIProvider {
  identifyLabel(image): Promise<WineExtraction>   // vision → structured wine fields + confidence
  lookupPrice(wine): Promise<PriceEstimate | null> // web search → {estimate, low, high, currency, source}
}
```

- Default implementation: Gemini Flash.
- Selected via environment variable; adding a provider = one new implementation, no business-logic changes.
- Returns **typed errors** (quota, timeout, low-confidence) so callers can fall back gracefully.

## 4. Data Model

Five entities. The **Wine catalog is the shared backbone**: search, prices, and reviews all attach to it.

### User
- `id` (uuid, PK), `email` (unique), `password_hash`/oauth, `name`, `created_at`

### Wine *(shared canonical catalog)*
- `id` (uuid, PK)
- `producer` (domaine), `cuvee` / name, `vintage` (millésime)
- `region`, `country`
- `color` (rouge / blanc / rosé / effervescent)
- `grapes` (cépages)
- `ref_label_image` (reference image)
- **Unique** on (`producer`, `cuvee`, `vintage`)

### CellarItem *(a user's bottles)*
- `id` (uuid, PK), `user_id` (FK), `wine_id` (FK)
- `quantity`
- `purchase_price`, `purchase_date`
- `drink_from`, `drink_before` (drink window)
- `location` (slot string — **reserved for future 3D**)
- `my_photo` (user's own label photo)
- `status` (in_cellar / drunk)
- `created_at`

### Review *(personal)*
- `id` (uuid, PK), `user_id` (FK), `wine_id` (FK)
- `rating` (0.5–5.0, half-star steps)
- `tasting_note` (text)
- `tasted_at`, `created_at`

### PriceSnapshot *(cached, mutualized)*
- `id` (uuid, PK), `wine_id` (FK)
- `estimate`, `low`, `high`, `currency`
- `source`, `fetched_at`

### Relationships
- User `1—N` CellarItem · User `1—N` Review
- Wine `1—N` CellarItem · Wine `1—N` Review · Wine `1—N` PriceSnapshot
- **Personal ranking** = a sort/filter query over Review + CellarItem (by rating, price, region, drink-before).

## 5. Key Flows

### 5.1 Add bottle by photo (primary path)
1. User photographs the label (camera on mobile, file upload on desktop).
2. Image uploaded to the app; validated (type, size).
3. `identifyLabel(image)` → structured extraction + confidence.
4. **Dedupe** against the Wine catalog via fuzzy match on (producer, cuvée, vintage).
   - Match → link to existing Wine.
   - No match → create a new Wine.
5. Pre-filled form shown; user confirms/corrects.
6. Create the CellarItem (quantity, drink window, etc.).
7. If the Wine has no recent PriceSnapshot, enqueue an async price lookup.

**Fallbacks:** low confidence or AI failure → drop to name search → manual form pre-filled with whatever was extracted. The flow never hard-blocks.

### 5.2 Price refresh (cron)
- Periodic job scans wines whose latest PriceSnapshot is missing or stale (> N days).
- For each, call `lookupPrice(wine)` (web-grounded search + extraction).
- Store a new PriceSnapshot. Same lookup runs on-demand when a new wine enters the catalog.

### 5.3 Browse / rank cellar
- Grid of the user's CellarItems with **filters** (color, region, rating, drink-before, value) and **sorts**.
- Click → wine detail: catalog info + my bottles + my review + current quote + price history.

### 5.4 Review a wine
- From a wine/bottle detail: set a star rating + write a tasting note.

## 6. Error Handling

Principle: **never block the user.**

- **AI label fail / low confidence** → name search → manual form (pre-filled with partial extraction).
- **AI provider quota/outage** → typed errors; retries with backoff. Price lookups queue ("quote pending"); label ID degrades to manual.
- **Price not found** → store a "no estimate" record with timestamp; retry later; UI shows "—".
- **Upload validation** → reject oversized/invalid images with a clear message.

## 7. Testing Strategy

- **Unit (TDD):** catalog dedupe, price-staleness logic, rating, filters/sorts — pure functions first.
- **AI layer:** mock the provider interface (no real API calls in tests). Test extraction→mapping and every fallback path against fixtures.
- **Integration:** server actions against a disposable test Postgres.
- **E2E (light):** add-by-photo happy path with a stubbed AI provider.

## 8. UI / Design System

The interface uses the user's existing **Marathon UI Kit** design system (`/Users/nathanmercier/Documents/Resource/Design System/Marathon UI Kit.html`).

- **Colors:** ink `#1a1614`, cream `#f7f5f0` / `#efeae0`, cards `#ffffff`, lines `#e5ddd0`, accent terracotta `#d85b3d` / `#b84527`, sage `#6b8e65`. Intensity scale z1→z5 (`#b9c6b3, #6b8e65, #e89178, #d85b3d, #b84527`) usable for rating/drink-window heat.
- **Type:** Instrument Serif (display, italic available) + system sans (body). Defined scale display→micro.
- **Spacing/radius/motion:** tokens s-1…s-8, radius 8/16/22/pill, durations 120/180/320ms, ease-out cubic-bezier(.2,.7,.15,1).

Aesthetic: warm, editorial, cream + terracotta + ink — a strong fit for wine.

## 9. Open Questions / Future

- Price refresh interval `N` (days) — to tune once a provider is chosen.
- Choice of local FS vs MinIO for photos — start with local FS.
- Fuzzy-match thresholds for catalog dedupe — refine during implementation against real label data.
- Layer 2: the 3D cellar (separate spec → plan → implementation cycle).
