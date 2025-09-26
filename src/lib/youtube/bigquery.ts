import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient } from '@/lib/bigquery';
import type { YoutubeChannelSnapshot, YoutubeVideoSnapshot, YoutubeAnalyticsRow } from './api';

export interface YoutubeBigQueryContext {
  client: BigQuery;
  projectId: string;
  datasetId: string;
}

export interface ChannelRow extends YoutubeChannelSnapshot {
  media: string;
  snapshotDate: string;
  collectedAt: string;
  isSelf: boolean;
}

export interface VideoRow extends YoutubeVideoSnapshot {
  media: string;
  snapshotDate: string;
  collectedAt: string;
  viewVelocity?: number | null;
  engagementRate?: number | null;
}

export interface AnalyticsRow extends YoutubeAnalyticsRow {
  media: string;
  collectedAt: string;
}

export function createYoutubeBigQueryContext(projectId: string, datasetId: string): YoutubeBigQueryContext {
  const client = createBigQueryClient(projectId);
  return { client, projectId, datasetId };
}

export async function ensureYoutubeTables(context: YoutubeBigQueryContext) {
  const { client, projectId, datasetId } = context;
  const datasetQualified = `\`${projectId}.${datasetId}\``;

  const ddlStatements = [
    `CREATE SCHEMA IF NOT EXISTS ${datasetQualified}`,
    `CREATE TABLE IF NOT EXISTS ${datasetQualified}.media_channels_snapshot (
      media STRING NOT NULL,
      channel_id STRING NOT NULL,
      channel_title STRING,
      description STRING,
      country STRING,
      custom_url STRING,
      subscriber_count INT64,
      view_count INT64,
      video_count INT64,
      snapshot_date DATE NOT NULL,
      collected_at TIMESTAMP NOT NULL,
      uploads_playlist_id STRING,
      is_self BOOL
    )
    PARTITION BY snapshot_date
    CLUSTER BY media, channel_id` ,
    `CREATE TABLE IF NOT EXISTS ${datasetQualified}.media_videos_snapshot (
      media STRING NOT NULL,
      content_id STRING NOT NULL,
      channel_id STRING NOT NULL,
      title STRING,
      description STRING,
      tags ARRAY<STRING>,
      published_at TIMESTAMP,
      duration_seconds INT64,
      view_count INT64,
      like_count INT64,
      comment_count INT64,
      view_velocity FLOAT64,
      engagement_rate FLOAT64,
      snapshot_date DATE NOT NULL,
      collected_at TIMESTAMP NOT NULL
    )
    PARTITION BY snapshot_date
    CLUSTER BY media, channel_id`,
    `CREATE TABLE IF NOT EXISTS ${datasetQualified}.media_metrics_daily (
      media STRING NOT NULL,
      date DATE NOT NULL,
      metric_type STRING NOT NULL,
      value FLOAT64,
      dimension_values STRING,
      collected_at TIMESTAMP NOT NULL
    )
    PARTITION BY date
    CLUSTER BY media, metric_type`
  ];

  for (const statement of ddlStatements) {
    await client.query({ query: statement });
  }
}

async function deleteExistingChannels(context: YoutubeBigQueryContext, snapshotDate: string, channelIds: string[]) {
  if (channelIds.length === 0) return;
  const { client, projectId, datasetId } = context;
  await client.query({
    query: `
      DELETE FROM \`${projectId}.${datasetId}.media_channels_snapshot\`
      WHERE snapshot_date = @snapshot_date
        AND channel_id IN UNNEST(@channel_ids)
        AND media = 'youtube'
    `,
    params: {
      snapshot_date: snapshotDate,
      channel_ids: channelIds,
    },
  });
}

async function deleteExistingVideos(context: YoutubeBigQueryContext, snapshotDate: string, videoIds: string[]) {
  if (videoIds.length === 0) return;
  const { client, projectId, datasetId } = context;
  await client.query({
    query: `
      DELETE FROM \`${projectId}.${datasetId}.media_videos_snapshot\`
      WHERE snapshot_date = @snapshot_date
        AND content_id IN UNNEST(@video_ids)
        AND media = 'youtube'
    `,
    params: {
      snapshot_date: snapshotDate,
      video_ids: videoIds,
    },
  });
}

export async function insertChannels(context: YoutubeBigQueryContext, rows: ChannelRow[]) {
  if (!rows.length) return;
  await deleteExistingChannels(context, rows[0].snapshotDate, rows.map((row) => row.channelId));
  const { client, datasetId, projectId } = context;
  const table = client.dataset(datasetId).table('media_channels_snapshot');
  const formatted = rows.map((row) => ({
    media: row.media,
    channel_id: row.channelId,
    channel_title: row.title,
    description: row.description,
    country: row.country,
    custom_url: row.customUrl,
    subscriber_count: row.subscriberCount ?? null,
    view_count: row.viewCount ?? null,
    video_count: row.videoCount ?? null,
    snapshot_date: row.snapshotDate,
    collected_at: row.collectedAt,
    uploads_playlist_id: row.uploadsPlaylistId ?? null,
    is_self: row.isSelf,
  }));
  await table.insert(formatted, { ignoreUnknownValues: true });
  console.info(`[youtube] inserted ${rows.length} channel snapshots into ${projectId}.${datasetId}.media_channels_snapshot`);
}

export async function insertVideos(context: YoutubeBigQueryContext, rows: VideoRow[]) {
  if (!rows.length) return;
  await deleteExistingVideos(context, rows[0].snapshotDate, rows.map((row) => row.videoId));
  const { client, datasetId, projectId } = context;
  const table = client.dataset(datasetId).table('media_videos_snapshot');
  const formatted = rows.map((row) => ({
    media: row.media,
    content_id: row.videoId,
    channel_id: row.channelId,
    title: row.title,
    description: row.description ?? null,
    tags: row.tags ?? [],
    published_at: row.publishedAt,
    duration_seconds: row.durationSeconds ?? null,
    view_count: row.viewCount ?? null,
    like_count: row.likeCount ?? null,
    comment_count: row.commentCount ?? null,
    view_velocity: row.viewVelocity ?? null,
    engagement_rate: row.engagementRate ?? null,
    snapshot_date: row.snapshotDate,
    collected_at: row.collectedAt,
  }));
  await table.insert(formatted, { ignoreUnknownValues: true });
  console.info(`[youtube] inserted ${rows.length} video snapshots into ${projectId}.${datasetId}.media_videos_snapshot`);
}

export async function insertAnalytics(context: YoutubeBigQueryContext, rows: AnalyticsRow[]) {
  if (!rows.length) return;
  const { client, datasetId, projectId } = context;
  const table = client.dataset(datasetId).table('media_metrics_daily');

  const formatted = rows.flatMap((row) =>
    Object.entries(row.metrics).map(([metricType, value]) => ({
      media: row.media,
      date: row.date,
      metric_type: metricType,
      value,
      dimension_values: JSON.stringify(row.dimensions ?? {}),
      collected_at: row.collectedAt,
    })),
  );

  if (!formatted.length) return;

  await table.insert(formatted, { ignoreUnknownValues: true });
  console.info(`[youtube] inserted ${formatted.length} analytics metrics into ${projectId}.${datasetId}.media_metrics_daily`);
}
