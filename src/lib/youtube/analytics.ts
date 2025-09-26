import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

export interface AnalyticsSummary {
  views: number;
  watchTime: number;
  subscribersGained: number;
  subscribersLost: number;
}

export async function fetchChannelBasics(
  client: OAuth2Client,
  channelId: string,
  startDate: string,
  endDate: string,
): Promise<AnalyticsSummary> {
  const analytics = google.youtubeAnalytics({ version: 'v2', auth: client as any });

  const report = await analytics.reports.query({
    ids: channelId === 'MINE' ? 'channel==MINE' : `channel==${channelId}`,
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost',
  });

  const row = report.data.rows?.[0] ?? [0, 0, 0, 0];
  return {
    views: Number(row[0] ?? 0),
    watchTime: Number(row[1] ?? 0),
    subscribersGained: Number(row[2] ?? 0),
    subscribersLost: Number(row[3] ?? 0),
  };
}

export async function getChannelAnalyticsSummary(client: OAuth2Client, channelId: string) {
  const endDate = new Date().toISOString().slice(0, 10);
  const start30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [summary30, summary7] = await Promise.all([
    fetchChannelBasics(client, channelId, start30, endDate),
    fetchChannelBasics(client, channelId, start7, endDate),
  ]);

  return {
    last30Days: summary30,
    last7Days: summary7,
  };
}
