import type { YoutubeConfig } from './config';
import { fetchChannelSnapshots, fetchVideosForChannel } from './api';
import {
  insertChannels,
  insertVideos,
  type ChannelRow,
  type VideoRow,
  type YoutubeBigQueryContext,
} from './bigquery';

export interface YoutubeChannelSyncResult {
  channelCount: number;
  videoCount: number;
}

export async function syncYoutubeChannelSnapshots(
  config: YoutubeConfig,
  context: YoutubeBigQueryContext,
  channelIds: string[],
  options: { maxResults?: number; daysBack?: number } = {},
): Promise<YoutubeChannelSyncResult> {
  const uniqueChannelIds = Array.from(new Set(channelIds.filter(Boolean)));
  if (uniqueChannelIds.length === 0) {
    return { channelCount: 0, videoCount: 0 };
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const collectedAt = new Date().toISOString();

  console.info(`[youtube-sync] Fetching channel snapshots for ${uniqueChannelIds.length} channels`);
  const channelSnapshots = await fetchChannelSnapshots(config, uniqueChannelIds);
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

    const videos = await fetchVideosForChannel(config, snapshot.uploadsPlaylistId, {
      maxResults: options.maxResults ?? 60,
      daysBack: options.daysBack ?? 180,
    });
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
  return { channelCount: channelRows.length, videoCount: videoRows.length };
}
