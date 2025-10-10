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

export interface ContentScriptRow {
  media: string;
  contentId: string;
  themeKeyword?: string;
  targetPersona?: string[];
  videoType?: string;
  status: string;
  notionPageId?: string;
  generatedAt: string;
  updatedAt: string;
  author?: string;
  payloadJson: string;
  summary?: string;
  title?: string;
}

export interface StoredContentScript {
  contentId: string;
  themeKeyword?: string;
  targetPersona?: string[];
  videoType?: string;
  status: string;
  notionPageId?: string;
  generatedAt: string;
  updatedAt: string;
  author?: string;
  summary?: string;
  title?: string;
  payloadJson: Record<string, unknown> | null;
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
    CLUSTER BY media, metric_type`,
    `CREATE TABLE IF NOT EXISTS ${datasetQualified}.media_content_scripts (
      media STRING NOT NULL,
      content_id STRING NOT NULL,
      theme_keyword STRING,
      target_persona ARRAY<STRING>,
      video_type STRING,
      status STRING,
      notion_page_id STRING,
      generated_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL,
      author STRING,
      payload_json STRING,
      summary STRING,
      title STRING
    )
    PARTITION BY DATE(generated_at)
    CLUSTER BY media, status`
  ];

  for (const statement of ddlStatements) {
    await client.query({ query: statement });
  }
}

async function deleteExistingChannels(
  _context: YoutubeBigQueryContext,
  _snapshotDate: string,
  _channelIds: string[],
) {
  void _context;
  void _snapshotDate;
  void _channelIds;
  // Temporarily disabled due to streaming buffer limitation
  console.log('[youtube] Skipping delete operation due to streaming buffer');
  return;
}

async function deleteExistingVideos(
  _context: YoutubeBigQueryContext,
  _snapshotDate: string,
  _videoIds: string[],
) {
  void _context;
  void _snapshotDate;
  void _videoIds;
  // Temporarily disabled due to streaming buffer limitation
  console.log('[youtube] Skipping delete operation due to streaming buffer');
  return;
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

  // Get unique dates from the data
  const dates = Array.from(new Set(rows.map(r => r.date)));

  // Try to delete existing data for these dates (will fail if in streaming buffer, which is ok)
  try {
    const deleteQuery = `
      DELETE FROM \`${projectId}.${datasetId}.media_metrics_daily\`
      WHERE media = 'youtube'
        AND date IN (SELECT PARSE_DATE('%Y-%m-%d', date_str) FROM UNNEST(@dates) AS date_str)
    `;
    await client.query({
      query: deleteQuery,
      params: { dates },
    });
    console.info(`[youtube] deleted existing analytics data for ${dates.length} dates`);
  } catch (error) {
    if ((error as Error).message?.includes('streaming buffer')) {
      console.warn('[youtube] Could not delete existing data (streaming buffer active). Data may be duplicated temporarily.');
    } else {
      throw error;
    }
  }

  // Insert new data
  const table = client.dataset(datasetId).table('media_metrics_daily');
  await table.insert(formatted, { ignoreUnknownValues: true });
  console.info(`[youtube] inserted ${formatted.length} analytics metrics into ${projectId}.${datasetId}.media_metrics_daily`);
}

export async function insertContentScript(context: YoutubeBigQueryContext, row: ContentScriptRow) {
  const { client, datasetId, projectId } = context;
  const table = client.dataset(datasetId).table('media_content_scripts');

  const formatted = {
    media: row.media,
    content_id: row.contentId,
    theme_keyword: row.themeKeyword ?? null,
    target_persona: row.targetPersona ?? [],
    video_type: row.videoType ?? null,
    status: row.status,
    notion_page_id: row.notionPageId ?? null,
    generated_at: row.generatedAt,
    updated_at: row.updatedAt,
    author: row.author ?? null,
    payload_json: row.payloadJson,
    summary: row.summary ?? null,
    title: row.title ?? null,
  };

  await table.insert([formatted], { ignoreUnknownValues: true });
  console.info(`[youtube] inserted script ${row.contentId} into ${projectId}.${datasetId}.media_content_scripts`);
}

export async function listContentScripts(
  context: YoutubeBigQueryContext,
  options: { limit?: number } = {},
): Promise<StoredContentScript[]> {
  const { client, projectId, datasetId } = context;
  const limit = options.limit ?? 20;

  const [rows] = await client.query({
    query: `
      SELECT
        content_id,
        theme_keyword,
        target_persona,
        video_type,
        status,
        notion_page_id,
        generated_at,
        updated_at,
        author,
        summary,
        title,
        payload_json
      FROM \`${projectId}.${datasetId}.media_content_scripts\`
      WHERE media = 'youtube'
      ORDER BY generated_at DESC
      LIMIT @limit
    `,
    params: { limit },
  });

  return rows.map((row) => ({
    contentId: row.content_id ? String(row.content_id) : '',
    themeKeyword: row.theme_keyword ?? undefined,
    targetPersona: Array.isArray(row.target_persona) ? row.target_persona : undefined,
    videoType: row.video_type ?? undefined,
    status: row.status ?? 'unknown',
    notionPageId: row.notion_page_id ?? undefined,
    generatedAt: row.generated_at ? String(row.generated_at) : '',
    updatedAt: row.updated_at ? String(row.updated_at) : '',
    author: row.author ?? undefined,
    summary: row.summary ?? undefined,
    title: row.title ?? undefined,
    payloadJson: row.payload_json ? safeParseJSON(row.payload_json) : null,
  }));
}

function safeParseJSON(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    console.warn('[youtube] Failed to parse payload_json:', (error as Error).message);
  }
  return null;
}
