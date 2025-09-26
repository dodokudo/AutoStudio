import { resolveProjectId } from '@/lib/bigquery';

export interface YoutubeOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface YoutubeConfig {
  apiKey: string;
  projectId: string;
  datasetId: string;
  channelId?: string;
  competitorIds: string[];
  oauth?: YoutubeOAuthConfig;
}

function parseCompetitorIds(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function loadYoutubeConfig(): YoutubeConfig {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is not set');
  }

  const projectId = resolveProjectId();
  const datasetId = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';
  const channelId = process.env.YOUTUBE_CHANNEL_ID?.trim();
  const competitorIds = parseCompetitorIds(process.env.YOUTUBE_COMPETITOR_IDS);

  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN?.trim();

  const oauth = clientId && clientSecret && refreshToken
    ? { clientId, clientSecret, refreshToken }
    : undefined;

  return {
    apiKey,
    projectId,
    datasetId,
    channelId,
    competitorIds,
    oauth,
  };
}
