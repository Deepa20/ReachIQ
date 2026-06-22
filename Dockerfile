FROM node:20-alpine AS deps
WORKDIR /app
COPY web/package*.json ./web/
RUN npm --prefix web ci

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY web ./web
RUN npm --prefix web run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/web/public ./web/public
COPY --from=builder /app/web/.next/standalone ./
COPY --from=builder /app/web/.next/static ./web/.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "web/server.js"]
