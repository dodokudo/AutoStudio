import { createBigQueryClient } from '@/lib/bigquery';
import { getInstagramStorageConfig } from './bigquery';

export interface CompetitorFollowerPoint {
  date: string;
  username: string;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
}

export interface CompetitorAccountSummary {
  username: string;
  accountUrl: string | null;
  latestFollowers: number | null;
  followerDelta30d: number | null;
  followerDelta7d: number | null;
  topReelViews: number | null;
}

export interface CompetitorTranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface CompetitorReel {
  username: string;
  instagramMediaId: string;
  driveFileId: string | null;
  driveFileUrl: string | null;
  permalink: string | null;
  caption: string | null;
  postedAt: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentsCount: number | null;
  transcriptSegments: CompetitorTranscriptSegment[];
}

export interface CompetitorDashboardData {
  accountSummaries: CompetitorAccountSummary[];
  followerSeries: CompetitorFollowerPoint[];
  topReels: CompetitorReel[];
  lastUpdatedAt: string | null;
}

export async function getCompetitorDashboardData(): Promise<CompetitorDashboardData> {
  const { projectId, dataset, location } = getInstagramStorageConfig();
  const client = createBigQueryClient(projectId, location);

  // 1. フォロワー推移（直近120日）
  const [followerRows] = await client.query({
    query: `
      SELECT
        FORMAT_DATE('%Y-%m-%d', date) AS date,
        username,
        followers_count,
        follows_count,
        media_count,
        account_url
      FROM \`${projectId}.${dataset}.instagram_competitor_account_history\`
      ORDER BY username, date
    `,
    location,
  });

  const followerSeries: CompetitorFollowerPoint[] = (followerRows as Array<Record<string, unknown>>).map((row) => ({
    date: String(row.date ?? ''),
    username: String(row.username ?? ''),
    followersCount: row.followers_count !== null && row.followers_count !== undefined ? Number(row.followers_count) : null,
    followsCount: row.follows_count !== null && row.follows_count !== undefined ? Number(row.follows_count) : null,
    mediaCount: row.media_count !== null && row.media_count !== undefined ? Number(row.media_count) : null,
  }));

  // 2. アカウント別サマリ
  const accountMap = new Map<string, CompetitorAccountSummary>();
  for (const row of followerRows as Array<Record<string, unknown>>) {
    const username = String(row.username ?? '');
    if (!username) continue;
    if (!accountMap.has(username)) {
      accountMap.set(username, {
        username,
        accountUrl: row.account_url ? String(row.account_url) : `https://www.instagram.com/${username}/`,
        latestFollowers: null,
        followerDelta30d: null,
        followerDelta7d: null,
        topReelViews: null,
      });
    }
  }
  // 各ユーザー最新フォロワー数 + delta
  const today = new Date();
  const dateKey = (d: Date) => {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  const seriesByUser = new Map<string, CompetitorFollowerPoint[]>();
  for (const point of followerSeries) {
    const arr = seriesByUser.get(point.username) ?? [];
    arr.push(point);
    seriesByUser.set(point.username, arr);
  }
  for (const [username, series] of seriesByUser.entries()) {
    series.sort((a, b) => a.date.localeCompare(b.date));
    const latest = series[series.length - 1];
    if (!latest) continue;
    const latestDate = new Date(latest.date);
    const find = (offsetDays: number) => {
      const target = new Date(latestDate);
      target.setDate(target.getDate() - offsetDays);
      const targetKey = dateKey(target);
      let best: CompetitorFollowerPoint | null = null;
      for (const p of series) {
        if (p.date <= targetKey) best = p;
        else break;
      }
      return best;
    };
    const ref30 = find(30);
    const ref7 = find(7);
    const summary = accountMap.get(username);
    if (summary) {
      summary.latestFollowers = latest.followersCount;
      summary.followerDelta30d = ref30 && ref30.followersCount !== null && latest.followersCount !== null
        ? latest.followersCount - ref30.followersCount
        : null;
      summary.followerDelta7d = ref7 && ref7.followersCount !== null && latest.followersCount !== null
        ? latest.followersCount - ref7.followersCount
        : null;
    }
  }

  // 3. リール一覧（views top + transcript JOIN）
  const [reelRows] = await client.query({
    query: `
      WITH unique_reels AS (
        SELECT
          username,
          instagram_media_id,
          ANY_VALUE(drive_file_id) AS drive_file_id,
          ANY_VALUE(drive_file_url) AS drive_file_url,
          ANY_VALUE(permalink) AS permalink,
          ANY_VALUE(IFNULL(sheet_caption, caption)) AS caption,
          MAX(posted_at) AS posted_at,
          MAX(view_count) AS view_count,
          MAX(like_count) AS like_count,
          MAX(comments_count) AS comments_count
        FROM \`${projectId}.${dataset}.competitor_reels_raw\`
        GROUP BY username, instagram_media_id
      ),
      latest_transcripts AS (
        SELECT instagram_media_id, ANY_VALUE(segments_json) AS segments_json
        FROM \`${projectId}.${dataset}.competitor_reels_transcripts\`
        WHERE segments_json IS NOT NULL
        GROUP BY instagram_media_id
      )
      SELECT r.*, t.segments_json
      FROM unique_reels r
      LEFT JOIN latest_transcripts t ON r.instagram_media_id = t.instagram_media_id
      ORDER BY COALESCE(r.view_count, 0) DESC, r.posted_at DESC
      LIMIT 60
    `,
    location,
  });

  const topReels: CompetitorReel[] = (reelRows as Array<Record<string, unknown>>).map((row) => {
    let segments: CompetitorTranscriptSegment[] = [];
    if (row.segments_json) {
      try {
        const parsed = JSON.parse(String(row.segments_json));
        if (Array.isArray(parsed)) {
          segments = parsed.map((s) => ({
            start: Number(s.start ?? 0),
            end: Number(s.end ?? 0),
            text: String(s.text ?? '').trim(),
          }));
        }
      } catch {
        // ignore
      }
    }
    const postedAtRaw = row.posted_at;
    return {
      username: String(row.username ?? ''),
      instagramMediaId: String(row.instagram_media_id ?? ''),
      driveFileId: row.drive_file_id ? String(row.drive_file_id) : null,
      driveFileUrl: row.drive_file_url ? String(row.drive_file_url) : null,
      permalink: row.permalink ? String(row.permalink) : null,
      caption: row.caption ? String(row.caption) : null,
      postedAt: postedAtRaw
        ? typeof postedAtRaw === 'object' && 'value' in (postedAtRaw as object)
          ? String((postedAtRaw as { value: string }).value)
          : String(postedAtRaw)
        : null,
      viewCount: row.view_count !== null && row.view_count !== undefined ? Number(row.view_count) : null,
      likeCount: row.like_count !== null && row.like_count !== undefined ? Number(row.like_count) : null,
      commentsCount: row.comments_count !== null && row.comments_count !== undefined ? Number(row.comments_count) : null,
      transcriptSegments: segments,
    };
  });

  // 4. topReelViews を accountMap に反映
  const topByUser = new Map<string, number>();
  for (const reel of topReels) {
    const cur = topByUser.get(reel.username) ?? 0;
    if ((reel.viewCount ?? 0) > cur) topByUser.set(reel.username, reel.viewCount ?? 0);
  }
  for (const [username, top] of topByUser.entries()) {
    const s = accountMap.get(username);
    if (s) s.topReelViews = top;
  }

  const accountSummaries = Array.from(accountMap.values()).sort((a, b) =>
    (b.latestFollowers ?? 0) - (a.latestFollowers ?? 0),
  );

  return {
    accountSummaries,
    followerSeries,
    topReels,
    lastUpdatedAt: followerSeries[followerSeries.length - 1]?.date ?? null,
  };
}
