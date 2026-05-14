import { createBigQueryClient } from '@/lib/bigquery';
import { getInstagramStorageConfig } from './bigquery';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface ReelMetricSnapshot {
  instagramId: string;
  snapshotAt: string;
  publishedAt: string | null;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaProductType: string | null;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  reposts: number | null;
  totalInteractions: number | null;
  avgWatchTimeSeconds: number | null;
  totalWatchTimeSeconds: number | null;
  skipRate: number | null;
  crosspostedViews: number | null;
  facebookViews: number | null;
  instagramViews: number | null;
  durationSeconds: number | null;
  completionRate: number | null;
  metricsStatus: string;
  transcriptSegments: TranscriptSegment[];
  dropoffSegment: TranscriptSegment | null;
}

export interface BenchmarkStats {
  median: number | null;
  p25: number | null;
  p75: number | null;
  count: number;
}

export interface BenchmarkRating {
  value: number | null;
  level: 'high' | 'mid' | 'low' | 'unknown';
  rank: number | null;
  total: number;
}

export interface ReelMetricRow {
  snapshot: ReelMetricSnapshot;
  ratings: {
    views: BenchmarkRating;
    reach: BenchmarkRating;
    skipRate: BenchmarkRating;
    avgWatchTime: BenchmarkRating;
    completionRate: BenchmarkRating;
    likeRate: BenchmarkRating;
    saveRate: BenchmarkRating;
  };
}

export interface ReelMetricsDashboardData {
  rows: ReelMetricRow[];
  benchmarks: {
    views: BenchmarkStats;
    reach: BenchmarkStats;
    skipRate: BenchmarkStats;
    avgWatchTime: BenchmarkStats;
    completionRate: BenchmarkStats;
    likeRate: BenchmarkStats;
    saveRate: BenchmarkStats;
  };
  lastUpdatedAt: string | null;
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function computeBenchmark(values: Array<number | null>): BenchmarkStats {
  const filtered = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const sorted = [...filtered].sort((a, b) => a - b);
  return {
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    count: sorted.length,
  };
}

function rateFor(
  value: number | null,
  stats: BenchmarkStats,
  total: number,
  rank: number | null,
  options?: { lowerIsBetter?: boolean },
): BenchmarkRating {
  if (value === null || stats.p25 === null || stats.p75 === null) {
    return { value, level: 'unknown', rank, total };
  }
  const lowerIsBetter = options?.lowerIsBetter ?? false;
  let level: BenchmarkRating['level'];
  if (lowerIsBetter) {
    level = value <= stats.p25 ? 'high' : value >= stats.p75 ? 'low' : 'mid';
  } else {
    level = value >= stats.p75 ? 'high' : value <= stats.p25 ? 'low' : 'mid';
  }
  return { value, level, rank, total };
}

function rankBy(
  rows: ReelMetricSnapshot[],
  selector: (row: ReelMetricSnapshot) => number | null,
  lowerIsBetter = false,
): Map<string, number> {
  const ranked = rows
    .map((row) => ({ id: row.instagramId, value: selector(row) }))
    .filter((entry): entry is { id: string; value: number } => entry.value !== null);
  ranked.sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value));
  const map = new Map<string, number>();
  ranked.forEach((entry, idx) => map.set(entry.id, idx + 1));
  return map;
}

export async function getReelMetricsDashboardData(): Promise<ReelMetricsDashboardData> {
  const { projectId, dataset, location } = getInstagramStorageConfig();
  const client = createBigQueryClient(projectId, location);

  const query = `
    WITH latest_per_reel AS (
      SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY instagram_id ORDER BY snapshot_at DESC) AS rn
      FROM \`${projectId}.${dataset}.instagram_reel_metric_snapshots\`
    ),
    latest_transcripts AS (
      SELECT
        instagram_id,
        segments_json,
        ROW_NUMBER() OVER (PARTITION BY instagram_id ORDER BY transcribed_at DESC) AS rn
      FROM \`${projectId}.${dataset}.instagram_reel_transcripts\`
    )
    SELECT
      m.instagram_id,
      m.snapshot_at,
      m.timestamp AS published_at,
      m.caption,
      m.permalink,
      m.thumbnail_url,
      m.media_product_type,
      m.views,
      m.reach,
      m.likes,
      m.comments,
      m.saved,
      m.shares,
      m.reposts,
      m.total_interactions,
      m.ig_reels_avg_watch_time_ms,
      m.ig_reels_video_view_total_time_ms,
      m.reels_skip_rate,
      m.crossposted_views,
      m.facebook_views,
      m.duration_seconds,
      m.completion_rate,
      m.metrics_status,
      t.segments_json AS transcript_segments_json
    FROM latest_per_reel m
    LEFT JOIN latest_transcripts t
      ON t.instagram_id = m.instagram_id AND t.rn = 1
    WHERE m.rn = 1
    ORDER BY m.snapshot_at DESC, COALESCE(m.views, 0) DESC
    LIMIT 100
  `;

  const [rows] = await client.query({ query, location });

  const snapshots: ReelMetricSnapshot[] = rows.map((row) => {
    const views = row.views !== null && row.views !== undefined ? Number(row.views) : null;
    const facebookViews = row.facebook_views !== null && row.facebook_views !== undefined ? Number(row.facebook_views) : null;
    const crossposted = row.crossposted_views !== null && row.crossposted_views !== undefined ? Number(row.crossposted_views) : null;
    const igViews = crossposted !== null && facebookViews !== null ? crossposted - facebookViews : views;
    const avgMs = row.ig_reels_avg_watch_time_ms !== null && row.ig_reels_avg_watch_time_ms !== undefined ? Number(row.ig_reels_avg_watch_time_ms) : null;
    const totalMs = row.ig_reels_video_view_total_time_ms !== null && row.ig_reels_video_view_total_time_ms !== undefined ? Number(row.ig_reels_video_view_total_time_ms) : null;
    const snapshotAtRaw = row.snapshot_at;
    const publishedAtRaw = row.published_at;
    return {
      instagramId: String(row.instagram_id),
      snapshotAt: snapshotAtRaw && typeof snapshotAtRaw === 'object' && 'value' in snapshotAtRaw ? String(snapshotAtRaw.value) : String(snapshotAtRaw ?? ''),
      publishedAt: publishedAtRaw ? (typeof publishedAtRaw === 'object' && 'value' in publishedAtRaw ? String(publishedAtRaw.value) : String(publishedAtRaw)) : null,
      caption: row.caption ? String(row.caption) : null,
      permalink: row.permalink ? String(row.permalink) : null,
      thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
      mediaProductType: row.media_product_type ? String(row.media_product_type) : null,
      views,
      reach: row.reach !== null && row.reach !== undefined ? Number(row.reach) : null,
      likes: row.likes !== null && row.likes !== undefined ? Number(row.likes) : null,
      comments: row.comments !== null && row.comments !== undefined ? Number(row.comments) : null,
      saved: row.saved !== null && row.saved !== undefined ? Number(row.saved) : null,
      shares: row.shares !== null && row.shares !== undefined ? Number(row.shares) : null,
      reposts: row.reposts !== null && row.reposts !== undefined ? Number(row.reposts) : null,
      totalInteractions: row.total_interactions !== null && row.total_interactions !== undefined ? Number(row.total_interactions) : null,
      avgWatchTimeSeconds: avgMs !== null ? avgMs / 1000 : null,
      totalWatchTimeSeconds: totalMs !== null ? totalMs / 1000 : null,
      skipRate: row.reels_skip_rate !== null && row.reels_skip_rate !== undefined ? Number(row.reels_skip_rate) : null,
      crosspostedViews: crossposted,
      facebookViews,
      instagramViews: igViews,
      durationSeconds: row.duration_seconds !== null && row.duration_seconds !== undefined ? Number(row.duration_seconds) : null,
      completionRate: row.completion_rate !== null && row.completion_rate !== undefined ? Number(row.completion_rate) : null,
      metricsStatus: row.metrics_status ? String(row.metrics_status) : 'unknown',
      transcriptSegments: [] as TranscriptSegment[],
      dropoffSegment: null as TranscriptSegment | null,
      __segmentsJson: row.transcript_segments_json ? String(row.transcript_segments_json) : null,
    } as ReelMetricSnapshot & { __segmentsJson: string | null };
  });

  // パースして dropoff 計算
  for (const snapshot of snapshots) {
    const json = (snapshot as ReelMetricSnapshot & { __segmentsJson: string | null }).__segmentsJson;
    if (!json) continue;
    try {
      const parsed = JSON.parse(json) as TranscriptSegment[];
      if (Array.isArray(parsed)) {
        snapshot.transcriptSegments = parsed;
        const avg = snapshot.avgWatchTimeSeconds;
        if (avg !== null && parsed.length > 0) {
          const within = parsed.filter((seg) => seg.start <= avg);
          snapshot.dropoffSegment = within.length > 0 ? within[within.length - 1] : parsed[0];
        }
      }
    } catch {
      // ignore parse error
    }
    delete (snapshot as Partial<{ __segmentsJson: string | null }>).__segmentsJson;
  }

  const likeRate = (s: ReelMetricSnapshot) => (s.likes !== null && s.views ? (s.likes / s.views) * 100 : null);
  const saveRate = (s: ReelMetricSnapshot) => (s.saved !== null && s.views ? (s.saved / s.views) * 100 : null);

  const benchmarks = {
    views: computeBenchmark(snapshots.map((s) => s.views)),
    reach: computeBenchmark(snapshots.map((s) => s.reach)),
    skipRate: computeBenchmark(snapshots.map((s) => s.skipRate)),
    avgWatchTime: computeBenchmark(snapshots.map((s) => s.avgWatchTimeSeconds)),
    completionRate: computeBenchmark(snapshots.map((s) => s.completionRate)),
    likeRate: computeBenchmark(snapshots.map(likeRate)),
    saveRate: computeBenchmark(snapshots.map(saveRate)),
  };

  const viewsRank = rankBy(snapshots, (s) => s.views);
  const reachRank = rankBy(snapshots, (s) => s.reach);
  const skipRank = rankBy(snapshots, (s) => s.skipRate, true);
  const watchRank = rankBy(snapshots, (s) => s.avgWatchTimeSeconds);
  const completionRank = rankBy(snapshots, (s) => s.completionRate);
  const likeRateRank = rankBy(snapshots, likeRate);
  const saveRateRank = rankBy(snapshots, saveRate);

  const total = snapshots.length;
  const dashboardRows: ReelMetricRow[] = snapshots.map((snapshot) => ({
    snapshot,
    ratings: {
      views: rateFor(snapshot.views, benchmarks.views, total, viewsRank.get(snapshot.instagramId) ?? null),
      reach: rateFor(snapshot.reach, benchmarks.reach, total, reachRank.get(snapshot.instagramId) ?? null),
      skipRate: rateFor(snapshot.skipRate, benchmarks.skipRate, total, skipRank.get(snapshot.instagramId) ?? null, { lowerIsBetter: true }),
      avgWatchTime: rateFor(snapshot.avgWatchTimeSeconds, benchmarks.avgWatchTime, total, watchRank.get(snapshot.instagramId) ?? null),
      completionRate: rateFor(snapshot.completionRate, benchmarks.completionRate, total, completionRank.get(snapshot.instagramId) ?? null),
      likeRate: rateFor(likeRate(snapshot), benchmarks.likeRate, total, likeRateRank.get(snapshot.instagramId) ?? null),
      saveRate: rateFor(saveRate(snapshot), benchmarks.saveRate, total, saveRateRank.get(snapshot.instagramId) ?? null),
    },
  }));

  const lastUpdatedAt = snapshots.length > 0 ? snapshots[0].snapshotAt : null;

  return { rows: dashboardRows, benchmarks, lastUpdatedAt };
}
