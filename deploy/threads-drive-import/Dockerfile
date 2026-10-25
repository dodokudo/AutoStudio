FROM node:20-bookworm-slim
WORKDIR /app
COPY deploy/threads-drive-import/package*.json ./
RUN npm ci --omit=dev
COPY src/lib/bigquery.ts src/lib/threadsSupplementalMetrics.ts src/lib/threadsSupplementalInsights.ts src/lib/threadsDriveCsv.ts src/lib/threadsDriveReader.ts src/lib/threadsDriveImportState.ts ./src/lib/
COPY src/scripts/importThreadsInsightsFromDrive.ts ./src/scripts/
ARG SOURCE_REVISION
LABEL org.opencontainers.image.revision=$SOURCE_REVISION
ENV NODE_ENV=production
USER node
CMD ["./node_modules/.bin/tsx", "src/scripts/importThreadsInsightsFromDrive.ts", "--write"]
