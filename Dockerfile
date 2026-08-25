FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund

FROM deps AS build
WORKDIR /app
COPY . .
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_LIVEKIT_URL
ARG VITE_BUNNY_CDN_HOSTNAME
ARG VITE_BUNNY_STORAGE_ZONE
ARG VITE_STRIPE_PUBLISHABLE_KEY
ARG VITE_APP_NAME
ARG VITE_CDN_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_LIVEKIT_URL=${VITE_LIVEKIT_URL}
ENV VITE_BUNNY_CDN_HOSTNAME=${VITE_BUNNY_CDN_HOSTNAME}
ENV VITE_BUNNY_STORAGE_ZONE=${VITE_BUNNY_STORAGE_ZONE}
ENV VITE_STRIPE_PUBLISHABLE_KEY=${VITE_STRIPE_PUBLISHABLE_KEY}
ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_CDN_URL=${VITE_CDN_URL}
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# Coolify HTTP healthchecks invoke curl/wget inside the container.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json ./
COPY --from=build /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/tsconfig.server.json ./
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -fsS http://localhost:8080/api/health || exit 1
CMD ["npm", "run", "start:prod"]
