FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global pnpm@12.3.4 && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-alpine AS production

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global pnpm@12.3.4 && pnpm install --frozen-lockfile --prod && pnpm store prune

COPY --from=builder /app/dist/backend ./backend
COPY --from=builder /app/src/backend/db/schema.sql ./backend/db/schema.sql
COPY --from=builder /app/dist/frontend ./frontend

RUN mkdir -p data

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/weight-tracker.db

CMD ["node", "backend/server.js"]
