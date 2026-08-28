# Production image: build the static site, then serve it with Caddy.
#
# CRITICAL: this app needs cross-origin isolation (COOP/COEP headers) so that
# ONNX Runtime Web and libraw-wasm can use SharedArrayBuffer / WASM threads.
# Without these headers the AI and RAW-decode features fail at runtime. The
# Caddyfile below sets them on every response.

# ---- Stage 1: build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
# Serve from the root path locally (GitHub Pages uses /raw-studio/).
ENV VITE_BASE=/
RUN npm run build

# ---- Stage 2: serve ----
FROM caddy:2-alpine AS serve
COPY --from=build /app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
# Caddy runs in the foreground by default via its image entrypoint.
