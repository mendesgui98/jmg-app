# syntax=docker/dockerfile:1

# ---------- dependências ----------
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# ---------- build do front (SSR) ----------
FROM deps AS build
# Variáveis VITE_* entram no bundle do navegador no momento do build.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_API_URL
ARG VITE_SIGNUP_ENABLED=true
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_API_URL=$VITE_API_URL \
    VITE_SIGNUP_ENABLED=$VITE_SIGNUP_ENABLED \
    NITRO_PRESET=node-server
COPY . .
RUN bun run build

# ---------- runner de migrações ----------
FROM node:22-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules/postgres ./node_modules/postgres
COPY scripts/migrate.mjs ./scripts/migrate.mjs
COPY supabase/migrations ./supabase/migrations
CMD ["node", "scripts/migrate.mjs"]

# ---------- API própria ----------
# Node 22 executa TypeScript direto (--experimental-strip-types); sem etapa de build.
# Imagem do Playwright: traz o Chromium usado para gerar os PDFs de orçamento e contrato
# (mesma versão do playwright-core em api/package.json).
FROM mcr.microsoft.com/playwright:v1.56.1-noble AS api
WORKDIR /app/api
ENV NODE_ENV=production PORT=4000
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY api/src ./src
COPY api/assets ./assets
# Módulos puros compartilhados com o app (preço, proposta, extenso, documentos, cláusulas).
# A pasta inteira, para um import novo da API nunca faltar na imagem (o CI testa a subida).
COPY src/lib /app/src/lib
RUN echo '{"type":"module"}' > /app/package.json
USER pwuser
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--experimental-strip-types", "--no-warnings", "src/server.ts"]

# ---------- runtime do front ----------
FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=build /app/.output ./.output
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", ".output/server/index.mjs"]
