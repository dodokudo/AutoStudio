# syntax=docker/dockerfile:1
FROM node:20-bullseye

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
CMD ["npm", "run", "ig:sync"]
