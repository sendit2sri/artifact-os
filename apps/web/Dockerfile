# Stage 1: deps — install dependencies (used for dev + builder)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: builder — build the app (NEXT_PUBLIC_* baked at build time)
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG NEXT_PUBLIC_E2E_MODE=true
ARG NEXT_PUBLIC_ENABLE_TEST_SEED=true
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_E2E_MODE=$NEXT_PUBLIC_E2E_MODE
ENV NEXT_PUBLIC_ENABLE_TEST_SEED=$NEXT_PUBLIC_ENABLE_TEST_SEED
RUN npm run build
RUN npm prune --omit=dev

# Stage 3: runner — production image (used for E2E prod mode)
FROM node:20-alpine AS runner
RUN apk --no-cache add wget
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.js ./
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
