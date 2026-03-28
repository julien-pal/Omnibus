# ── Stage 1: Build backend (TypeScript → JS) ─────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package.json ./
COPY backend/package.json ./backend/
RUN npm install --workspace=backend
COPY backend/ ./backend/
RUN npm run build --workspace=backend

# ── Stage 2: Build frontend (Next.js standalone) ─────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm install --workspace=frontend
COPY frontend/ ./frontend/
ENV NEXT_TELEMETRY_DISABLED=1
ENV BASE_PATH=/__OMNIBUS_BASE_PATH__
ENV NEXT_PUBLIC_BASE_PATH=/__OMNIBUS_BASE_PATH__
RUN npm run build --workspace=frontend

# ── Stage 3: Production image ─────────────────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app

# Backend runtime dependencies (no devDeps)
COPY package.json ./
COPY backend/package.json ./backend/
RUN npm install --workspace=backend --omit=dev

# Compiled backend
COPY --from=backend-builder /app/backend/dist ./backend/dist

# Next.js standalone server (self-contained with its own node_modules)
COPY --from=frontend-builder /app/frontend/.next/standalone/ ./frontend-server/
# Static assets — must sit at frontend/.next/static relative to the standalone root
COPY --from=frontend-builder /app/frontend/.next/static ./frontend-server/frontend/.next/static
# Public assets
COPY --from=frontend-builder /app/frontend/public ./frontend-server/frontend/public

# Startup script
COPY .docker/start.sh ./
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 8080 = Next.js (main entry — handles frontend + proxies /api to Express)
# 8686 = Express backend (internal, can be exposed for direct API access)
EXPOSE 8080 8686

CMD ["./start.sh"]
