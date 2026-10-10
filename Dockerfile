# Focus Realm Workspace — production image (self-hosting; Vercel needs none of this).
#   docker build -t focus-realm-workspace .
#   docker run -p 3000:3000 --env-file .env focus-realm-workspace

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev && npm install --no-save prisma@7 tsx

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN useradd --system --uid 1001 workspace
COPY --from=build --chown=workspace /app ./
USER workspace
EXPOSE 3000
# Apply any pending migrations, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p ${PORT}"]
