import { createBigQueryClient } from '@/lib/bigquery';
import { getInstagramStorageConfig } from './bigquery';

export interface StoryMetricSnapshotView {
  instagramId: string;
  snapshotAt: string;
  publishedAt: string | null;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaType: string | null;
  views: number | null;
  reach: number | null;
  replies: number | null;
  shares: number | null;
  totalInteractions: number | null;
  profileVisits: number | null;
  follows: number | null;
  navigation: number | null;
  profileActivity: number | null;
  viewRate: number | null;
  metricsStatus: string;
}

export interface StoryMetricsDashboardData {
  rows: StoryMetricSnapshotView[];
  lastUpdatedAt: string | null;
}

export async function getStoryMetricsDashboardData(): Promise<StoryMetricsDashboardData> {
  const { projectId, dataset, location } = getInstagramStorageConfig();
  const client = createBigQueryClient(projectId, location);

  const query = `
    WITH latest_per_story AS (
      SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY instagram_id ORDER BY snapshot_at DESC) AS rn
      FROM \`${projectId}.${dataset}.instagram_story_metric_snapshots\`
    )
    SELECT
      instagram_id,
      snapshot_at,
      timestamp AS published_at,
      caption,
      permalink,
      thumbnail_url,
      media_type,
      views,
      reach,
      replies,
      shares,
      total_interactions,
      profile_visits,
      follows,
      navigation,
      profile_activity,
      metrics_status
    FROM latest_per_story
    WHERE rn = 1
    ORDER BY snapshot_at DESC, COALESCE(views, 0) DESC
    LIMIT 200
  `;

  try {
    const [rows] = await client.query({ query, location });
    const snapshots: StoryMetricSnapshotView[] = rows.map((row) => {
      const views = row.views !== null && row.views !== undefined ? Number(row.views) : null;
      const reach = row.reach !== null && row.reach !== undefined ? Number(row.reach) : null;
      const snapshotAtRaw = row.snapshot_at;
      const publishedAtRaw = row.published_at;
      return {
        instagramId: String(row.instagram_id),
        snapshotAt: snapshotAtRaw && typeof snapshotAtRaw === 'object' && 'value' in snapshotAtRaw
          ? String(snapshotAtRaw.value)
          : String(snapshotAtRaw ?? ''),
        publishedAt: publishedAtRaw
          ? typeof publishedAtRaw === 'object' && 'value' in publishedAtRaw
            ? String(publishedAtRaw.value)
            : String(publishedAtRaw)
          : null,
        caption: row.caption ? String(row.caption) : null,
        permalink: row.permalink ? String(row.permalink) : null,
        thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
        mediaType: row.media_type ? String(row.media_type) : null,
        views,
        reach,
        replies: row.replies !== null && row.replies !== undefined ? Number(row.replies) : null,
        shares: row.shares !== null && row.shares !== undefined ? Number(row.shares) : null,
        totalInteractions: row.total_interactions !== null && row.total_interactions !== undefined ? Number(row.total_interactions) : null,
        profileVisits: row.profile_visits !== null && row.profile_visits !== undefined ? Number(row.profile_visits) : null,
        follows: row.follows !== null && row.follows !== undefined ? Number(row.follows) : null,
        navigation: row.navigation !== null && row.navigation !== undefined ? Number(row.navigation) : null,
        profileActivity: row.profile_activity !== null && row.profile_activity !== undefined ? Number(row.profile_activity) : null,
        viewRate: views !== null && reach !== null && reach > 0 ? views / reach : null,
        metricsStatus: row.metrics_status ? String(row.metrics_status) : 'unknown',
      };
    });
    return {
      rows: snapshots,
      lastUpdatedAt: snapshots[0]?.snapshotAt ?? null,
    };
  } catch (error) {
    console.warn('[instagram/storyMetricsDashboard] Failed to load', error);
    return { rows: [], lastUpdatedAt: null };
  }
}
