# 4-stage Dockerfile 跟 conventions/deployment.md 对齐
# 参考 dream-agent / mingle-api

# ─── 1. 依赖层 ──────────────────────────────────────
FROM docker.m.daocloud.io/library/node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod=false

# ─── 2. 构建层 ──────────────────────────────────────
FROM docker.m.daocloud.io/library/node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml* tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# ─── 3. 生产依赖 ────────────────────────────────────
FROM docker.m.daocloud.io/library/node:22-alpine AS prod-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.24.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# ─── 4. 运行层 ──────────────────────────────────────
FROM docker.m.daocloud.io/library/node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
