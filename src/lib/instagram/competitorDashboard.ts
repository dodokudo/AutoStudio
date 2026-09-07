import { createBigQueryClient } from '@/lib/bigquery';
import { getInstagramStorageConfig } from './bigquery';
import {
  buildCompetitorReelChapters,
  deriveCompetitorReelTitle,
  type CompetitorTranscriptChapter,
  type CompetitorVisualTimelineFrame,
} from './competitorTranscript';

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
  transcriptTitle: string | null;
  durationSeconds: number | null;
  hookText: string | null;
  hookLabels: string[];
  visualTimeline: CompetitorVisualTimelineFrame[];
  transcriptSegments: CompetitorTranscriptSegment[];
  transcriptChapters: CompetitorTranscriptChapter[];
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
      WITH active_competitors AS (
        SELECT username
        FROM \`${projectId}.${dataset}.instagram_competitors_private\`
        WHERE IFNULL(active, TRUE) = TRUE
      )
      SELECT
        FORMAT_DATE('%Y-%m-%d', h.date) AS date,
        h.username,
        h.followers_count,
        h.follows_count,
        h.media_count,
        h.account_url
      FROM \`${projectId}.${dataset}.instagram_competitor_account_history\` h
      JOIN active_competitors a USING (username)
      ORDER BY h.username, h.date
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
      WITH active_competitors AS (
        SELECT username
        FROM \`${projectId}.${dataset}.instagram_competitors_private\`
        WHERE IFNULL(active, TRUE) = TRUE
      ),
      unique_reels AS (
        SELECT
          r.username,
          r.instagram_media_id,
          ARRAY_AGG(r.drive_file_id ORDER BY IF(REGEXP_CONTAINS(r.drive_file_url, r'(drive\\.google\\.com|storage\\.googleapis\\.com)'), 1, 0) DESC, r.created_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS drive_file_id,
          ARRAY_AGG(r.drive_file_url ORDER BY IF(REGEXP_CONTAINS(r.drive_file_url, r'(drive\\.google\\.com|storage\\.googleapis\\.com)'), 1, 0) DESC, r.created_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS drive_file_url,
          ARRAY_AGG(r.permalink IGNORE NULLS ORDER BY r.created_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS permalink,
          ARRAY_AGG(IFNULL(r.sheet_caption, r.caption) IGNORE NULLS ORDER BY r.created_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS caption,
          MAX(r.posted_at) AS posted_at,
          MAX(r.view_count) AS view_count,
          MAX(r.like_count) AS like_count,
          MAX(r.comments_count) AS comments_count
        FROM \`${projectId}.${dataset}.competitor_reels_raw\` r
        JOIN active_competitors a USING (username)
        WHERE DATE(r.posted_at, 'Asia/Tokyo') >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 120 DAY)
        GROUP BY r.username, r.instagram_media_id
      ),
      ranked_reels AS (
        SELECT
          r.*,
          ROW_NUMBER() OVER (
            PARTITION BY r.username
            ORDER BY COALESCE(r.view_count, 0) DESC, r.posted_at DESC
          ) AS account_rank
        FROM unique_reels r
      ),
      latest_transcripts AS (
        SELECT * EXCEPT(rn)
        FROM (
          SELECT
            instagram_media_id,
            summary,
            segments_json,
            chapters_json,
            duration_seconds,
            hook_text,
            hook_labels_json,
            visual_timeline_json,
            ROW_NUMBER() OVER (
              PARTITION BY instagram_media_id
              ORDER BY COALESCE(transcribed_at, created_at) DESC
            ) AS rn
          FROM \`${projectId}.${dataset}.competitor_reels_transcripts\`
          WHERE segments_json IS NOT NULL
        )
        WHERE rn = 1
      )
      SELECT
        r.* EXCEPT(account_rank),
        t.summary AS transcript_title,
        t.segments_json,
        t.chapters_json,
        t.duration_seconds,
        t.hook_text,
        t.hook_labels_json,
        t.visual_timeline_json
      FROM ranked_reels r
      LEFT JOIN latest_transcripts t ON r.instagram_media_id = t.instagram_media_id
      WHERE r.account_rank <= 60
      ORDER BY COALESCE(r.view_count, 0) DESC, r.posted_at DESC
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
    let chapters: CompetitorTranscriptChapter[] = [];
    if (row.chapters_json) {
      try {
        const parsed = JSON.parse(String(row.chapters_json));
        if (Array.isArray(parsed)) {
          chapters = parsed.map((chapter) => ({
            start: Number(chapter.start ?? 0),
            end: Number(chapter.end ?? 0),
            title: String(chapter.title ?? '').trim(),
            kind: chapter.kind === 'hook' || chapter.kind === 'cta' ? chapter.kind : 'body',
          })).filter((chapter) => chapter.title.length > 0 && chapter.end >= chapter.start);
        }
      } catch {
        // ignore
      }
    }
    if (!chapters.length && segments.length) chapters = buildCompetitorReelChapters(segments);
    let hookLabels: string[] = [];
    if (row.hook_labels_json) {
      try {
        const parsed = JSON.parse(String(row.hook_labels_json));
        if (Array.isArray(parsed)) hookLabels = parsed.map(String).filter(Boolean);
      } catch {
        // ignore
      }
    }
    let visualTimeline: CompetitorVisualTimelineFrame[] = [];
    if (row.visual_timeline_json) {
      try {
        const parsed = JSON.parse(String(row.visual_timeline_json));
        if (Array.isArray(parsed)) {
          visualTimeline = parsed.map((frame) => ({
            time: Number(frame.time ?? 0),
            imageUrl: String(frame.imageUrl ?? ''),
            phase: frame.phase === 'hook' ? 'hook' as const : 'body' as const,
            spokenText: String(frame.spokenText ?? '').trim(),
          })).filter((frame) => frame.imageUrl && Number.isFinite(frame.time));
        }
      } catch {
        // ignore
      }
    }
    const postedAtRaw = row.posted_at;
    const transcriptTitle = row.transcript_title
      ? String(row.transcript_title).trim()
      : segments.length
        ? deriveCompetitorReelTitle(segments)
        : null;
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
      transcriptTitle,
      durationSeconds: row.duration_seconds !== null && row.duration_seconds !== undefined ? Number(row.duration_seconds) : null,
      hookText: row.hook_text ? String(row.hook_text).trim() : null,
      hookLabels,
      visualTimeline,
      transcriptSegments: segments,
      transcriptChapters: chapters,
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
