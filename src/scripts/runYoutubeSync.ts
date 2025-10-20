import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { loadYoutubeConfig } from '@/lib/youtube/config';
import { fetchChannelSnapshots, fetchVideosForChannel, fetchYoutubeAnalytics } from '@/lib/youtube/api';
import {
  createYoutubeBigQueryContext,
  ensureYoutubeTables,
  insertAnalytics,
  insertChannels,
  insertVideos,
  type ChannelRow,
  type VideoRow,
  type AnalyticsRow,
} from '@/lib/youtube/bigquery';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const config = loadYoutubeConfig();
  const context = createYoutubeBigQueryContext(config.projectId, config.datasetId);
  await ensureYoutubeTables(context);

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const collectedAt = new Date().toISOString();

  const channelIdSet = new Set<string>();
  config.competitorIds.forEach((id) => channelIdSet.add(id));
  if (config.channelId) {
    channelIdSet.add(config.channelId);
  }
  const channelIds = Array.from(channelIdSet);

  if (channelIds.length === 0) {
    console.warn('[youtube-sync] No channel IDs configured. Set YOUTUBE_COMPETITOR_IDS or YOUTUBE_CHANNEL_ID');
    return;
  }

  console.info(`[youtube-sync] Fetching channel snapshots for ${channelIds.length} channels`);
  const channelSnapshots = await fetchChannelSnapshots(config, channelIds);

  const channelRows: ChannelRow[] = channelSnapshots.map((snapshot) => ({
    ...snapshot,
    media: 'youtube',
    snapshotDate,
    collectedAt,
    isSelf: snapshot.channelId === config.channelId,
  }));

  await insertChannels(context, channelRows);

  console.info('[youtube-sync] Fetching latest videos for channels');
  const videoRows: VideoRow[] = [];
  for (const snapshot of channelSnapshots) {
    if (!snapshot.uploadsPlaylistId) {
      console.warn(`[youtube-sync] Missing uploads playlist for channel ${snapshot.channelId}`);
      continue;
    }

    const videos = await fetchVideosForChannel(config, snapshot.uploadsPlaylistId, { maxResults: 60, daysBack: 180 });
    for (const video of videos) {
      const publishedAtDate = new Date(video.publishedAt);
      const daysSincePublish = Math.max(
        1,
        Math.floor((Date.now() - publishedAtDate.getTime()) / (1000 * 60 * 60 * 24)),
      );

      const viewVelocity = video.viewCount ? video.viewCount / daysSincePublish : null;
      const engagementRate = video.viewCount
        ? ((video.likeCount ?? 0) + (video.commentCount ?? 0)) / Math.max(video.viewCount, 1)
        : null;

      videoRows.push({
        ...video,
        media: 'youtube',
        snapshotDate,
        collectedAt,
        viewVelocity,
        engagementRate,
      });
    }
  }

  await insertVideos(context, videoRows);
  console.info(`[youtube-sync] Inserted ${videoRows.length} video snapshots`);

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
