# syntax=docker/dockerfile:1
FROM node:20-bullseye

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux' -o /usr/local/bin/yt-dlp \
  && chmod 0755 /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
CMD ["npm", "run", "ig:sync-competitors"]
