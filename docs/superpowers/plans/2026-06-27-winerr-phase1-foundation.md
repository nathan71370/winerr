# Winerr Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a self-hosted Next.js app where a user can register, log in, and land on an (empty) cellar page — with the full database schema, Docker stack, and Marathon design tokens in place.

**Architecture:** A single Next.js (App Router, standalone output) container talks to a PostgreSQL container. Drizzle ORM owns the schema and migrations. Auth.js v5 handles credential auth with bcrypt-hashed passwords stored in Postgres. The whole stack runs via Docker Compose, deployable through Komodo. UI is themed from the Marathon design tokens.

**Tech Stack:** Next.js 16 (App Router, TypeScript), pnpm, Drizzle ORM + drizzle-kit, postgres-js, Auth.js v5 (next-auth), bcryptjs, zod, Vitest.

**Roadmap (later phases, separate plans):** Phase 2 — wine catalog + AI provider layer + add-by-photo inventory. Phase 3 — reviews & ranking. Phase 4 — automatic price tracking (AI agent + cron).

---

## File Structure

```
winerr/
├── Dockerfile                      # multi-stage build, Next.js standalone
├── docker-compose.yml              # app + postgres
├── .env.example                    # documented env vars
├── drizzle.config.ts               # drizzle-kit config
├── next.config.ts                  # output: 'standalone'
├── vitest.config.ts
├── package.json
├── src/
│   ├── db/
│   │   ├── index.ts                # drizzle client (singleton)
│   │   └── schema.ts               # all 5 tables
│   ├── auth/
│   │   ├── password.ts             # hash/verify helpers (pure, tested)
│   │   ├── config.ts               # Auth.js config + Credentials provider
│   │   └── actions.ts              # register server action
│   ├── lib/
│   │   └── validation.ts           # zod schemas (register/login)
│   ├── app/
│   │   ├── layout.tsx              # root layout, fonts, theme
│   │   ├── globals.css             # Marathon design tokens
│   │   ├── page.tsx                # redirect to /cellar or /login
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── cellar/page.tsx         # protected empty-state cellar
│   │   └── api/auth/[...nextauth]/route.ts
│   └── middleware.ts               # route protection
└── tests/
    ├── password.test.ts
    └── validation.test.ts
```

---

## Task 1: Project scaffold & tooling

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` (already exists — verify)

- [ ] **Step 1: Scaffold Next.js**

Run (non-interactive):
```bash
pnpm create next-app@latest . --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-pnpm --yes
```
Expected: project files generated under `src/`. If the directory-not-empty prompt appears, allow overwrite of scaffold files only (keep `docs/`, `.gitignore`, `.superpowers/`).

- [ ] **Step 2: Add dependencies**

Run:
```bash
pnpm add drizzle-orm postgres next-auth@beta bcryptjs zod
pnpm add -D drizzle-kit vitest @types/bcryptjs dotenv
```
Expected: packages added to `package.json`, lockfile updated.

- [ ] **Step 3: Configure Next.js standalone output**

Create `next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
```

Add scripts to `package.json` (`"scripts"` block):
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate"
}
```

- [ ] **Step 5: Verify the app builds and dev server boots**

Run: `pnpm build`
Expected: build completes, `.next/standalone` produced.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with tooling (drizzle, auth.js, vitest)"
```

---

## Task 2: Marathon design tokens & root layout

**Files:**
- Create/Modify: `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Write the design tokens**

Replace `src/app/globals.css` with:
```css
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');

:root {
  /* colors */
  --ink: #1a1614; --ink-soft: #4a4340; --ink-mute: #8a8076;
  --cream: #f7f5f0; --cream-deep: #efeae0; --card: #ffffff; --line: #e5ddd0;
  --accent: #d85b3d; --accent-deep: #b84527; --sage: #6b8e65; --good: #6b8e65; --warn: #d85b3d;
  --z1: #b9c6b3; --z2: #6b8e65; --z3: #e89178; --z4: #d85b3d; --z5: #b84527;
  /* type */
  --serif: 'Instrument Serif', Georgia, serif;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --t-display: clamp(44px, 8vw, 64px); --t-h1: 44px; --t-h2: 26px; --t-h3: 22px;
  --t-body: 15px; --t-small: 13px; --t-meta: 11px; --t-kicker: 10px;
  --lh-display: 1.05; --lh-tight: 1.15; --lh-body: 1.45;
  /* space / radius / motion */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 14px; --s-5: 18px; --s-6: 22px; --s-7: 32px; --s-8: 44px;
  --radius-sm: 8px; --radius: 16px; --radius-lg: 22px; --radius-pill: 999px;
  --dur-fast: 120ms; --dur: 180ms; --dur-slow: 320ms;
  --ease-out: cubic-bezier(.2, .7, .15, 1);
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--cream); color: var(--ink); font-family: var(--sans); font-size: var(--t-body); line-height: var(--lh-body); }
h1, h2, h3 { font-family: var(--serif); font-weight: 400; line-height: var(--lh-tight); }
a { color: var(--accent-deep); text-decoration: none; }
```

- [ ] **Step 2: Write the root layout**

Replace `src/app/layout.tsx` with:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Winerr",
  description: "Suivi de cave à vin",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: add Marathon design tokens and root layout"
```

---

## Task 3: Database schema (Drizzle)

**Files:**
- Create: `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`

- [ ] **Step 1: Write the schema**

Create `src/db/schema.ts`:
```ts
import { pgTable, uuid, text, integer, timestamp, numeric, pgEnum, date, unique } from "drizzle-orm/pg-core";

export const wineColor = pgEnum("wine_color", ["rouge", "blanc", "rose", "effervescent"]);
export const cellarStatus = pgEnum("cellar_status", ["in_cellar", "drunk"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const wines = pgTable("wines", {
  id: uuid("id").primaryKey().defaultRandom(),
  producer: text("producer").notNull(),
  cuvee: text("cuvee"),
  vintage: integer("vintage"),
  region: text("region"),
  country: text("country"),
  color: wineColor("color"),
  grapes: text("grapes"),
  refLabelImage: text("ref_label_image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqWine: unique("uniq_wine").on(t.producer, t.cuvee, t.vintage),
}));

export const cellarItems = pgTable("cellar_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  wineId: uuid("wine_id").notNull().references(() => wines.id),
  quantity: integer("quantity").notNull().default(1),
  purchasePrice: numeric("purchase_price", { precision: 10, scale: 2 }),
  purchaseDate: date("purchase_date"),
  drinkFrom: integer("drink_from"),
  drinkBefore: integer("drink_before"),
  location: text("location"),
  myPhoto: text("my_photo"),
  status: cellarStatus("status").notNull().default("in_cellar"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  wineId: uuid("wine_id").notNull().references(() => wines.id),
  rating: numeric("rating", { precision: 2, scale: 1 }),
  tastingNote: text("tasting_note"),
  tastedAt: date("tasted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const priceSnapshots = pgTable("price_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  wineId: uuid("wine_id").notNull().references(() => wines.id),
  estimate: numeric("estimate", { precision: 10, scale: 2 }),
  low: numeric("low", { precision: 10, scale: 2 }),
  high: numeric("high", { precision: 10, scale: 2 }),
  currency: text("currency").notNull().default("EUR"),
  source: text("source"),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: Write the db client**

Create `src/db/index.ts`:
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

- [ ] **Step 3: Write drizzle config**

Create `drizzle.config.ts`:
```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 4: Generate the first migration**

Run: `pnpm db:generate`
Expected: a SQL migration file appears under `./drizzle/`.

- [ ] **Step 5: Commit**

```bash
git add src/db drizzle.config.ts drizzle/
git commit -m "feat: add database schema and drizzle config"
```

---

## Task 4: Docker stack

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.env.example`

- [ ] **Step 1: Write the Dockerfile**

Create `Dockerfile`:
```dockerfile
FROM node:24-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Write docker-compose.yml**

Create `docker-compose.yml`:
```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://winerr:${POSTGRES_PASSWORD}@db:5432/winerr
      AUTH_SECRET: ${AUTH_SECRET}
      AUTH_TRUST_HOST: "true"
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: winerr
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: winerr
    volumes:
      - winerr_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U winerr"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  winerr_pgdata:
```

- [ ] **Step 3: Write .env.example**

Create `.env.example`:
```bash
# Postgres
POSTGRES_PASSWORD=changeme
# Full connection string for local dev / drizzle-kit
DATABASE_URL=postgres://winerr:changeme@localhost:5432/winerr
# Auth.js — generate with: openssl rand -base64 32
AUTH_SECRET=
AUTH_TRUST_HOST=true
# AI provider (Phase 2) — left blank in Phase 1
AI_PROVIDER=gemini
GEMINI_API_KEY=
```

- [ ] **Step 4: Verify the stack starts**

Run:
```bash
cp .env.example .env && sed -i '' 's/AUTH_SECRET=/AUTH_SECRET=devsecret/' .env
docker compose up -d --build db
docker compose exec -T db pg_isready -U winerr
```
Expected: `accepting connections`.

- [ ] **Step 5: Run migrations against the running db**

Run: `pnpm db:migrate`
Expected: migrations applied, no error.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example
git commit -m "feat: add Docker stack (app + postgres) for Komodo"
```

---

## Task 5: Password hashing (TDD)

**Files:**
- Create: `src/auth/password.ts`
- Test: `tests/password.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/password.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/auth/password";

describe("password", () => {
  it("hashes then verifies the same password", async () => {
    const hash = await hashPassword("monMotDePasse!");
    expect(hash).not.toBe("monMotDePasse!");
    expect(await verifyPassword("monMotDePasse!", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("monMotDePasse!");
    expect(await verifyPassword("mauvais", hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/password.test.ts`
Expected: FAIL — cannot resolve `@/auth/password`.

- [ ] **Step 3: Write minimal implementation**

Create `src/auth/password.ts`:
```ts
import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/password.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth/password.ts tests/password.test.ts
git commit -m "feat: add password hashing helpers (tested)"
```

---

## Task 6: Validation schemas (TDD)

**Files:**
- Create: `src/lib/validation.ts`
- Test: `tests/validation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { registerSchema } from "@/lib/validation";

describe("registerSchema", () => {
  it("accepts a valid registration", () => {
    const r = registerSchema.safeParse({ email: "a@b.com", password: "longenough", name: "Nathan" });
    expect(r.success).toBe(true);
  });

  it("rejects a bad email", () => {
    const r = registerSchema.safeParse({ email: "nope", password: "longenough", name: "X" });
    expect(r.success).toBe(false);
  });

  it("rejects a short password", () => {
    const r = registerSchema.safeParse({ email: "a@b.com", password: "short", name: "X" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/validation.test.ts`
Expected: FAIL — cannot resolve `@/lib/validation`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/validation.ts`:
```ts
import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/validation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts tests/validation.test.ts
git commit -m "feat: add register/login validation schemas (tested)"
```

---

## Task 7: Auth.js configuration

**Files:**
- Create: `src/auth/config.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`

- [ ] **Step 1: Write the Auth.js config**

Create `src/auth/config.ts`:
```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/auth/password";
import { loginSchema } from "@/lib/validation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
        if (!user?.passwordHash) return null;
        if (!(await verifyPassword(password, user.passwordHash))) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
```

- [ ] **Step 2: Wire the route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/auth/config";

export const { GET, POST } = handlers;
```

- [ ] **Step 3: Add route-protection middleware**

Create `src/middleware.ts`:
```ts
import { auth } from "@/auth/config";

export default auth((req) => {
  const isAuthed = !!req.auth;
  const isProtected = req.nextUrl.pathname.startsWith("/cellar");
  if (isProtected && !isAuthed) {
    const url = new URL("/login", req.nextUrl.origin);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/cellar/:path*"],
};
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/auth/config.ts "src/app/api/auth/[...nextauth]/route.ts" src/middleware.ts
git commit -m "feat: configure Auth.js with credentials provider and route protection"
```

---

## Task 8: Register server action

**Files:**
- Create: `src/auth/actions.ts`

- [ ] **Step 1: Write the register action**

Create `src/auth/actions.ts`:
```ts
"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/auth/password";
import { registerSchema } from "@/lib/validation";
import { signIn } from "@/auth/config";

export async function registerAction(_prev: unknown, formData: FormData) {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: "Champs invalides (email valide + mot de passe ≥ 8 caractères)." };
  }
  const { email, password, name } = parsed.data;

  const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (existing) return { error: "Un compte existe déjà avec cet email." };

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ email, name, passwordHash });

  await signIn("credentials", { email, password, redirect: false });
  redirect("/cellar");
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/auth/actions.ts
git commit -m "feat: add register server action"
```

---

## Task 9: Auth pages (login & register)

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`

- [ ] **Step 1: Write the register page**

Create `src/app/(auth)/register/page.tsx`:
```tsx
"use client";

import { useActionState } from "react";
import { registerAction } from "@/auth/actions";

export default function RegisterPage() {
  const [state, action, pending] = useActionState(registerAction, null);
  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: "var(--s-6)" }}>
      <h1 style={{ fontSize: "var(--t-h1)" }}>Créer un compte</h1>
      <form action={action} style={{ display: "grid", gap: "var(--s-3)", marginTop: "var(--s-6)" }}>
        <input name="name" placeholder="Nom" required style={inputStyle} />
        <input name="email" type="email" placeholder="Email" required style={inputStyle} />
        <input name="password" type="password" placeholder="Mot de passe (≥ 8)" required style={inputStyle} />
        {state?.error && <p style={{ color: "var(--warn)", fontSize: "var(--t-small)" }}>{state.error}</p>}
        <button disabled={pending} style={btnStyle}>{pending ? "…" : "S'inscrire"}</button>
      </form>
      <p style={{ marginTop: "var(--s-4)", fontSize: "var(--t-small)" }}>
        Déjà un compte ? <a href="/login">Se connecter</a>
      </p>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)",
  background: "var(--card)", fontSize: "var(--t-body)",
};
const btnStyle: React.CSSProperties = {
  padding: "var(--s-3)", border: "none", borderRadius: "var(--radius-pill)",
  background: "var(--accent)", color: "#fff", fontSize: "var(--t-body)", cursor: "pointer",
};
```

- [ ] **Step 2: Write the login page**

Create `src/app/(auth)/login/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { signIn } from "@/auth/config";

export default function LoginPage() {
  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirect: false,
      });
    } catch {
      redirect("/login?error=1");
    }
    redirect("/cellar");
  }

  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: "var(--s-6)" }}>
      <h1 style={{ fontSize: "var(--t-h1)" }}>Se connecter</h1>
      <form action={login} style={{ display: "grid", gap: "var(--s-3)", marginTop: "var(--s-6)" }}>
        <input name="email" type="email" placeholder="Email" required style={inputStyle} />
        <input name="password" type="password" placeholder="Mot de passe" required style={inputStyle} />
        <button style={btnStyle}>Entrer</button>
      </form>
      <p style={{ marginTop: "var(--s-4)", fontSize: "var(--t-small)" }}>
        Pas de compte ? <a href="/register">S'inscrire</a>
      </p>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)",
  background: "var(--card)", fontSize: "var(--t-body)",
};
const btnStyle: React.CSSProperties = {
  padding: "var(--s-3)", border: "none", borderRadius: "var(--radius-pill)",
  background: "var(--accent)", color: "#fff", fontSize: "var(--t-body)", cursor: "pointer",
};
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)"
git commit -m "feat: add login and register pages"
```

---

## Task 10: Protected cellar shell & landing redirect

**Files:**
- Create: `src/app/cellar/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write the cellar empty-state page**

Create `src/app/cellar/page.tsx`:
```tsx
import { auth, signOut } from "@/auth/config";

export default async function CellarPage() {
  const session = await auth();
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>Ma cave</h1>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button style={{ background: "none", border: "none", color: "var(--ink-mute)", cursor: "pointer", fontSize: "var(--t-small)" }}>
            Déconnexion
          </button>
        </form>
      </header>
      <p style={{ color: "var(--ink-mute)", marginTop: "var(--s-2)" }}>
        Bonjour {session?.user?.name ?? "amateur de vin"}.
      </p>
      <div style={{ marginTop: "var(--s-8)", textAlign: "center", padding: "var(--s-8)", border: "1px dashed var(--line)", borderRadius: "var(--radius-lg)", background: "var(--card)" }}>
        <p style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h2)" }}>Ta cave est vide</p>
        <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginTop: "var(--s-2)" }}>
          L'ajout de bouteilles arrive en Phase 2.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Write the landing redirect**

Replace `src/app/page.tsx` with:
```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth/config";

export default async function Home() {
  const session = await auth();
  redirect(session ? "/cellar" : "/login");
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Manual end-to-end check**

Run:
```bash
docker compose up -d --build
```
Then in a browser: visit `http://localhost:3000` → redirected to `/login` → register a new account → land on `/cellar` showing "Ta cave est vide" → Déconnexion → back to `/login`.
Expected: full register→login→protected-page→logout loop works.

- [ ] **Step 5: Commit**

```bash
git add src/app/cellar/page.tsx src/app/page.tsx
git commit -m "feat: add protected cellar shell and landing redirect"
```

---

## Self-Review Notes

- **Spec coverage (Phase 1 portion):** self-host stack (Tasks 1,4), Postgres + full 5-table schema (Task 3), Auth.js self-hosted auth (Tasks 5–10), Marathon design tokens (Task 2). Catalog/AI/inventory, reviews, and pricing are intentionally deferred to Phases 2–4 per the roadmap.
- **No placeholders:** every step ships concrete file contents and exact commands.
- **Type consistency:** `hashPassword`/`verifyPassword`, `registerSchema`/`loginSchema`, and the `signIn`/`auth`/`signOut` exports from `@/auth/config` are referenced consistently across tasks. The `location` column on `cellarItems` is reserved for the future 3D layer, matching the spec.
- **Known follow-ups for Phase 2:** migrations currently run via `pnpm db:migrate` against a reachable DB; a container entrypoint that runs migrations on boot can be added when the app container is first deployed through Komodo.
```
