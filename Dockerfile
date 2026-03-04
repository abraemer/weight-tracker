FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

FROM node:20-alpine AS production

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean

COPY --from=builder /app/dist/backend ./backend
COPY --from=builder /app/src/backend/db/schema.sql ./backend/db/schema.sql
COPY --from=builder /app/dist/frontend ./frontend

RUN mkdir -p data

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/weight-tracker.db

CMD ["node", "backend/server.js"]
