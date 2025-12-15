# syntax=docker/dockerfile:1
FROM node:20-bullseye

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
# デフォルトは全モード実行。Schedulerから SYNC_MODE 環境変数で切り替え
CMD ["sh", "-c", "npm run sync:threads:api ${SYNC_MODE:-all}"]
