import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface YouTubeAnalyticsData {
  channelId: string;
  // 概要データ
  views: number;
  watchTime: number;
  subscribersGained: number;
  subscribersLost: number;
  // 視聴者データ
  demographics: {
    ageGroup: Record<string, number>;
    gender: Record<string, number>;
    geography: Record<string, number>;
  };
  // トラフィックソース
  trafficSources: Record<string, number>;
  // 収益データ（有効な場合）
  revenue?: {
    estimatedRevenue: number;
    cpm: number;
    rpm: number;
  };
}

export async function getYouTubeAnalytics(
  oauth2Client: OAuth2Client,
  channelId: string,
  startDate: string = '2024-01-01',
  endDate: string = new Date().toISOString().split('T')[0]
): Promise<YouTubeAnalyticsData> {
  const analytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });

  try {
    // 基本メトリクス取得
    const basicMetrics = await analytics.reports.query({
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      metrics: 'views,watchTime,subscribersGained,subscribersLost',
    });

    // 年齢・性別データ取得
    const demographics = await analytics.reports.query({
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      metrics: 'viewerPercentage',
      dimensions: 'ageGroup,gender',
    });

    // 地理的データ取得
    const geography = await analytics.reports.query({
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      metrics: 'views',
      dimensions: 'country',
      sort: '-views',
      maxResults: 10,
    });

    // トラフィックソース取得
    const trafficSources = await analytics.reports.query({
      ids: `channel==${channelId}`,
      startDate,
      endDate,
      metrics: 'views',
      dimensions: 'insightTrafficSourceType',
      sort: '-views',
    });

    // 収益データ取得（可能な場合）
    let revenue;
    try {
      const revenueData = await analytics.reports.query({
        ids: `channel==${channelId}`,
        startDate,
        endDate,
        metrics: 'estimatedRevenue,cpm,rpm',
      });

      if (revenueData.data.rows && revenueData.data.rows.length > 0) {
        const [estimatedRevenue, cpm, rpm] = revenueData.data.rows[0];
        revenue = {
          estimatedRevenue: Number(estimatedRevenue),
          cpm: Number(cpm),
          rpm: Number(rpm),
        };
      }
    } catch (error) {
      // 収益データにアクセスできない場合はスキップ
      console.warn('Revenue data not accessible:', error);
    }

    // データを整形
    const [views, watchTime, subscribersGained, subscribersLost] = basicMetrics.data.rows?.[0] || [0, 0, 0, 0];

    // デモグラフィクスデータを整形
    const ageGenderData: Record<string, number> = {};
    const genderData: Record<string, number> = {};
    demographics.data.rows?.forEach((row: unknown[]) => {
      const [ageGroup, gender, percentage] = row as [string, string, number];
      ageGenderData[`${ageGroup}_${gender}`] = Number(percentage);
      genderData[gender] = (genderData[gender] || 0) + Number(percentage);
    });

    // 地理データを整形
    const geographyData: Record<string, number> = {};
    geography.data.rows?.forEach((row: unknown[]) => {
      const [country, views] = row as [string, number];
      geographyData[country] = Number(views);
    });

    // トラフィックソースデータを整形
    const trafficSourceData: Record<string, number> = {};
    trafficSources.data.rows?.forEach((row: unknown[]) => {
      const [source, views] = row as [string, number];
      trafficSourceData[source] = Number(views);
    });

    return {
      channelId,
      views: Number(views),
      watchTime: Number(watchTime),
      subscribersGained: Number(subscribersGained),
      subscribersLost: Number(subscribersLost),
      demographics: {
        ageGroup: ageGenderData,
        gender: genderData,
        geography: geographyData,
      },
      trafficSources: trafficSourceData,
      revenue,
    };

  } catch (error) {
    console.error('YouTube Analytics API error:', error);
    throw new Error(`Failed to fetch YouTube Analytics data: ${error}`);
  }
}

export async function getChannelAnalyticsSummary(oauth2Client: OAuth2Client, channelId: string) {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const startDate7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [data30Days, data7Days] = await Promise.all([
    getYouTubeAnalytics(oauth2Client, channelId, startDate30, endDate),
    getYouTubeAnalytics(oauth2Client, channelId, startDate7, endDate),
  ]);

  return {
    last30Days: data30Days,
    last7Days: data7Days,
    trends: {
      viewsGrowth: data7Days.views - data30Days.views / 30 * 7,
      subscriberNetGrowth: (data30Days.subscribersGained - data30Days.subscribersLost),
      avgWatchTime: data30Days.watchTime / data30Days.views,
    },
  };
}