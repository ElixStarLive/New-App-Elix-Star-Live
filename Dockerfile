# Elix Star Live — production build and run
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
# Install dev dependencies so `vite build` is available during the build stage.
ENV NODE_ENV=development
RUN npm ci --no-audit --no-fund

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Let the runtime environment set NODE_ENV. If none is provided, the server
# defaults to development, which does not require SMTP.
ENV PORT=8080

COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/tsconfig.server.json ./

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=5 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || '8080') + '/api/health').then(r => { process.exit(r.ok ? 0 : 1) }).catch(() => process.exit(1))"

# Coolify runs `npm run migrate` as the release command, then this as start.
CMD ["npm", "run", "start:prod"]
