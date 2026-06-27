FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Next.js standalone reads HOSTNAME to choose its bind address. Docker sets
# HOSTNAME to the container id by default, making the server bind only to the
# container's ephemeral IP — which breaks container-internal healthchecks.
# Pin it to 0.0.0.0 so it listens on all interfaces.
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
EXPOSE 3000
CMD ["node", "server.js"]
