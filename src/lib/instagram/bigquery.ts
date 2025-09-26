import { BigQuery, Dataset, Table } from '@google-cloud/bigquery';
import { createBigQueryClient } from '@/lib/bigquery';
import { loadInstagramConfig } from './config';

export interface CompetitorReelRawRow {
  snapshot_date: string;
  drive_file_id: string;
  drive_file_url: string;
  username: string;
  instagram_media_id: string;
  caption: string | null;
  permalink: string;
  media_type: string;
  posted_at: string;
}

export interface CompetitorReelInsightRow {
  snapshot_date: string;
  instagram_media_id: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  engagement: number | null;
  avg_watch_time_sec: number | null;
}

export interface CompetitorTranscriptRow {
  snapshot_date: string;
  instagram_media_id: string;
  drive_file_id: string;
  summary: string;
  key_points: string[];
  hooks: string[];
  cta_ideas: string[];
}

export interface ReelScriptRow {
  snapshot_date: string;
  script_id: string;
  title: string;
  hook: string;
  body: string;
  cta: string;
  story_text: string;
  inspiration_sources: string[];
}

export function createInstagramBigQuery(): BigQuery {
  const config = loadInstagramConfig();
  return createBigQueryClient(config.projectId, config.location);
}

export async function ensureInstagramDataset(bigquery?: BigQuery): Promise<Dataset> {
  const config = loadInstagramConfig();
  const client = bigquery ?? createInstagramBigQuery();
  const dataset = client.dataset(config.dataset);
  const [exists] = await dataset.exists();
  if (!exists) {
    await dataset.create({ location: config.location });
  }
  return dataset;
}

async function ensureTable(
  dataset: Dataset,
  tableId: string,
  schema: { name: string; type: string; mode?: 'NULLABLE' | 'REQUIRED' | 'REPEATED' }[],
  partitionField?: string,
  clusteringFields?: string[],
): Promise<Table> {
  const table = dataset.table(tableId);
  const [exists] = await table.exists();
  if (exists) {
    return table;
  }

  await table.create({
    schema: { fields: schema },
    timePartitioning: partitionField
      ? {
          type: 'DAY',
          field: partitionField,
        }
      : undefined,
    clustering: clusteringFields?.length ? { fields: clusteringFields } : undefined,
  });

  return table;
}

export async function ensureInstagramTables(bigquery?: BigQuery): Promise<void> {
  const client = bigquery ?? createInstagramBigQuery();
  const dataset = await ensureInstagramDataset(client);

  await ensureTable(dataset, 'competitor_reels_raw', [
    { name: 'snapshot_date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'drive_file_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'drive_file_url', type: 'STRING', mode: 'REQUIRED' },
    { name: 'username', type: 'STRING', mode: 'REQUIRED' },
    { name: 'instagram_media_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'caption', type: 'STRING' },
    { name: 'permalink', type: 'STRING', mode: 'REQUIRED' },
    { name: 'media_type', type: 'STRING', mode: 'REQUIRED' },
    { name: 'posted_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ], 'snapshot_date', ['username']);

  await ensureTable(dataset, 'competitor_reels_insights', [
    { name: 'snapshot_date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'instagram_media_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'views', type: 'INT64' },
    { name: 'reach', type: 'INT64' },
    { name: 'likes', type: 'INT64' },
    { name: 'comments', type: 'INT64' },
    { name: 'saves', type: 'INT64' },
    { name: 'engagement', type: 'INT64' },
    { name: 'avg_watch_time_sec', type: 'FLOAT64' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ], 'snapshot_date', ['instagram_media_id']);

  await ensureTable(dataset, 'competitor_reels_transcripts', [
    { name: 'snapshot_date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'instagram_media_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'drive_file_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'summary', type: 'STRING', mode: 'REQUIRED' },
    { name: 'key_points', type: 'STRING', mode: 'REPEATED' },
    { name: 'hooks', type: 'STRING', mode: 'REPEATED' },
    { name: 'cta_ideas', type: 'STRING', mode: 'REPEATED' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ], 'snapshot_date', ['instagram_media_id']);

  await ensureTable(dataset, 'my_reels_scripts', [
    { name: 'snapshot_date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'script_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'title', type: 'STRING', mode: 'REQUIRED' },
    { name: 'hook', type: 'STRING', mode: 'REQUIRED' },
    { name: 'body', type: 'STRING', mode: 'REQUIRED' },
    { name: 'cta', type: 'STRING', mode: 'REQUIRED' },
    { name: 'story_text', type: 'STRING', mode: 'REQUIRED' },
    { name: 'inspiration_sources', type: 'STRING', mode: 'REPEATED' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ], 'snapshot_date', ['script_id']);

  await ensureTable(dataset, 'instagram_competitors_private', [
    { name: 'username', type: 'STRING', mode: 'REQUIRED' },
    { name: 'drive_folder_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'category', type: 'STRING' },
    { name: 'active', type: 'BOOL' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ]);

  await ensureTable(dataset, 'user_competitor_preferences', [
    { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'username', type: 'STRING', mode: 'REQUIRED' },
    { name: 'drive_folder_id', type: 'STRING' },
    { name: 'category', type: 'STRING' },
    { name: 'priority', type: 'INT64' },
    { name: 'active', type: 'BOOL' },
    { name: 'created_at', type: 'TIMESTAMP' },
  ], undefined, ['user_id']);
}

