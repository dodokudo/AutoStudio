import { google, youtube_v3, youtubeAnalytics_v2 } from 'googleapis';
import type { YoutubeConfig, YoutubeOAuthConfig } from './config';

export interface YoutubeChannelSnapshot {
  channelId: string;
  title: string;
  description?: string;
  country?: string;
  customUrl?: string;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
  uploadsPlaylistId?: string;
}

export interface YoutubeVideoSnapshot {
  videoId: string;
  channelId: string;
  title: string;
  description?: string;
  tags: string[];
  publishedAt: string;
  durationSeconds: number | null;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
}

export interface YoutubeAnalyticsRow {
  date: string;
  metrics: Record<string, number>;
  dimensions: Record<string, string>;
}

const youtube = google.youtube('v3');
const youtubeAnalytics = google.youtubeAnalytics('v2');

type OAuthClient = InstanceType<typeof google.auth.OAuth2>;

function createOAuthClient(oauth?: YoutubeOAuthConfig): OAuthClient | null {
  if (!oauth) return null;
  const client = new google.auth.OAuth2(oauth.clientId, oauth.clientSecret);
  client.setCredentials({ refresh_token: oauth.refreshToken });
  return client;
}

function toNumber(value?: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDurationToSeconds(duration?: string | null): number | null {
  if (!duration) return null;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  const seconds = match[3] ? Number(match[3]) : 0;
  return hours * 3600 + minutes * 60 + seconds;
}

export async function fetchChannelSnapshots(config: YoutubeConfig, channelIds: string[]): Promise<YoutubeChannelSnapshot[]> {
  if (channelIds.length === 0) return [];

  const response = await youtube.channels.list({
    key: config.apiKey,
    id: channelIds,
    part: ['snippet', 'statistics', 'contentDetails', 'brandingSettings'],
    maxResults: channelIds.length,
  });

  const items = response.data.items ?? [];
  return items.map((item) => {
    const stats = item.statistics;
    const snippet = item.snippet;
    const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads ?? undefined;

    return {
      channelId: item.id ?? '',
      title: snippet?.title ?? '',
      description: snippet?.description ?? undefined,
      country: snippet?.country ?? undefined,
      customUrl: snippet?.customUrl ?? undefined,
      subscriberCount: toNumber(stats?.subscriberCount),
      viewCount: toNumber(stats?.viewCount),
      videoCount: toNumber(stats?.videoCount),
      uploadsPlaylistId,
    };
  });
}

interface FetchVideosOptions {
  playlistId: string;
  maxResults?: number;
  publishedAfter?: Date;
}

async function listPlaylistVideoIds(apiKey: string, options: FetchVideosOptions): Promise<youtube_v3.Schema$PlaylistItem[]> {
  const results: youtube_v3.Schema$PlaylistItem[] = [];
  let pageToken: string | undefined;

  const limit = options.maxResults ?? 50;
  do {
    const response = await youtube.playlistItems.list({
      key: apiKey,
      part: ['contentDetails', 'snippet'],
      playlistId: options.playlistId,
      maxResults: Math.min(50, limit - results.length),
      pageToken,
    });
    const items = response.data.items ?? [];

    for (const item of items) {
      if (options.publishedAfter) {
        const publishedAt = item.contentDetails?.videoPublishedAt;
        if (publishedAt) {
          const publishedDate = new Date(publishedAt);
          if (publishedDate < options.publishedAfter) {
            return results;
          }
        }
      }
      results.push(item);
      if (results.length >= limit) {
        return results;
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken && results.length < limit);

  return results;
}

export async function fetchVideosForChannel(
  config: YoutubeConfig,
  playlistId: string,
  options: { maxResults?: number; daysBack?: number },
): Promise<YoutubeVideoSnapshot[]> {
  const publishedAfter = options.daysBack ? new Date(Date.now() - options.daysBack * 24 * 60 * 60 * 1000) : undefined;
  const playlistItems = await listPlaylistVideoIds(config.apiKey, {
    playlistId,
    maxResults: options.maxResults ?? 50,
    publishedAfter,
  });

  const videoIds = playlistItems
    .map((item) => item.contentDetails?.videoId)
    .filter((value): value is string => Boolean(value));

  if (videoIds.length === 0) return [];

  const snapshots: YoutubeVideoSnapshot[] = [];
  for (let index = 0; index < videoIds.length; index += 50) {
    const chunk = videoIds.slice(index, index + 50);
    const response = await youtube.videos.list({
      key: config.apiKey,
      id: chunk,
      part: ['snippet', 'statistics', 'contentDetails'],
      maxResults: chunk.length,
    });

    for (const item of response.data.items ?? []) {
      const snippet = item.snippet;
      const stats = item.statistics;
      const details = item.contentDetails;

      snapshots.push({
        videoId: item.id ?? '',
        channelId: snippet?.channelId ?? '',
        title: snippet?.title ?? '',
        description: snippet?.description ?? undefined,
        tags: snippet?.tags ?? [],
        publishedAt: snippet?.publishedAt ?? new Date().toISOString(),
        durationSeconds: parseDurationToSeconds(details?.duration),
        viewCount: toNumber(stats?.viewCount),
        likeCount: toNumber(stats?.likeCount),
        commentCount: toNumber(stats?.commentCount),
      });
    }
  }

  return snapshots;
}

export async function fetchYoutubeAnalytics(
  config: YoutubeConfig,
  params: {
    startDate: string;
    endDate: string;
    metrics: string;
    dimensions?: string;
    filters?: string;
    maxResults?: number;
  },
): Promise<YoutubeAnalyticsRow[]> {
  if (!config.channelId) {
    throw new Error('YOUTUBE_CHANNEL_ID is required for analytics fetch');
  }
  const auth = createOAuthClient(config.oauth);
  if (!auth) {
    throw new Error('OAuth credentials are required for YouTube Analytics API');
  }

  google.options({ auth });

  const response = await youtubeAnalytics.reports.query({
    ids: 'channel==MINE',
    startDate: params.startDate,
    endDate: params.endDate,
    metrics: params.metrics,
    dimensions: params.dimensions,
    filters: params.filters,
    maxResults: params.maxResults ?? 200,
  });

  const data = response.data;
  const columnHeaders = data.columnHeaders ?? [];
  const rows = data.rows ?? [];

  return rows.map((row): YoutubeAnalyticsRow => {
    const metrics: Record<string, number> = {};
    const dimensions: Record<string, string> = {};

    row.forEach((value: string | number, index: number) => {
      const header = columnHeaders[index];
      if (!header || !header.name) return;
      const name = header.name;
      if (header.columnType === 'DIMENSION') {
        dimensions[name] = String(value);
      } else {
        const num = Number(value);
        metrics[name] = Number.isFinite(num) ? num : 0;
      }
    });

    const date = dimensions.day ?? params.endDate;

    return {
      date,
      metrics,
      dimensions,
    };
  });
}
