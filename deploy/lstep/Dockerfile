# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx playwright install --with-deps chromium

ENV NODE_ENV=production
CMD ["npm", "run", "lstep:ingest"]
