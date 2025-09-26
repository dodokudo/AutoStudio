import { google } from 'googleapis';
import type { YoutubeOAuthClient } from './oauth';

export interface AnalyticsSummary {
  views: number;
  watchTime: number;
  subscribersGained: number;
  subscribersLost: number;
}

export async function fetchChannelBasics(
  client: YoutubeOAuthClient,
  channelId: string,
  startDate: string,
  endDate: string,
): Promise<AnalyticsSummary> {
  google.options({ auth: client });
  const analytics = google.youtubeAnalytics('v2');

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

export async function getChannelAnalyticsSummary(client: YoutubeOAuthClient, channelId: string) {
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
