import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { loadYoutubeConfig } from '@/lib/youtube/config';
import { fetchYoutubeAnalytics } from '@/lib/youtube/api';
import {
  createYoutubeBigQueryContext,
  ensureYoutubeTables,
  insertAnalytics,
  type AnalyticsRow,
} from '@/lib/youtube/bigquery';
import { listActiveYoutubeCompetitors } from '@/lib/youtube/competitors';
import { syncYoutubeChannelSnapshots } from '@/lib/youtube/sync';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const config = loadYoutubeConfig();
  const context = createYoutubeBigQueryContext(config.projectId, config.datasetId);
  await ensureYoutubeTables(context);

  const collectedAt = new Date().toISOString();

  const channelIdSet = new Set<string>();
  const managedCompetitors = await listActiveYoutubeCompetitors(context);
  const competitorIds = managedCompetitors.length
    ? managedCompetitors.map((competitor) => competitor.channelId)
    : config.competitorIds;
  competitorIds.forEach((id) => channelIdSet.add(id));
  if (config.channelId) {
    channelIdSet.add(config.channelId);
  }
  const channelIds = Array.from(channelIdSet);

  if (channelIds.length === 0) {
    console.warn('[youtube-sync] No channel IDs configured. Set YOUTUBE_COMPETITOR_IDS or YOUTUBE_CHANNEL_ID');
    return;
  }

  await syncYoutubeChannelSnapshots(config, context, channelIds);

  if (config.oauth && config.channelId) {
    console.info('[youtube-sync] Fetching analytics metrics');
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate.getTime());
    startDate.setDate(startDate.getDate() - 30);

    const analyticsRows = await fetchYoutubeAnalytics(config, {
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      metrics: [
        'views',
        'estimatedMinutesWatched',
        'averageViewDuration',
        'averageViewPercentage',
        'subscribersGained',
        'subscribersLost',
        'engagedViews',
        'likes',
        'comments',
        'shares',
      ].join(','),
      dimensions: 'day',
    });

    const analyticsRowsWithMeta: AnalyticsRow[] = analyticsRows.map((row) => ({
      ...row,
      media: 'youtube',
      collectedAt,
    }));

    await insertAnalytics(context, analyticsRowsWithMeta);
    console.info(`[youtube-sync] Inserted analytics rows for ${analyticsRows.length} days`);
  } else {
    console.info('[youtube-sync] Skipping analytics sync (missing OAuth credentials or channel ID)');
  }
}

main().catch((error) => {
  console.error('[youtube-sync] Failed:', error);
  process.exitCode = 1;
});
