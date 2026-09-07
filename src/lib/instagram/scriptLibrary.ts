import { createBigQueryClient } from '@/lib/bigquery';
import { getInstagramStorageConfig } from './bigquery';

export interface ScriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface ScriptEntry {
  source: 'self' | 'competitor';
  username: string;
  instagramId: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  caption: string | null;
  postedAt: string | null;
  views: number | null;
  likes: number | null;
  durationSeconds: number | null;
  avgWatchTimeSeconds: number | null;
  completionRate: number | null;
  transcriptSegments: ScriptSegment[];
  rawText: string;
}

export interface GeneratedScriptEntry {
  scriptId: string;
  snapshotDate: string;
  title: string;
  hook: string;
  body: string;
  cta: string;
  storyText: string;
  inspirationSources: string[];
  createdAt: string | null;
}

export interface ScriptLibraryData {
  generatedScripts: GeneratedScriptEntry[];
  generatedCount: number;
  entries: ScriptEntry[];
  selfCount: number;
  competitorCount: number;
}

export async function getScriptLibraryData(): Promise<ScriptLibraryData> {
  const { projectId, dataset, location } = getInstagramStorageConfig();
  const client = createBigQueryClient(projectId, location);

  const [generatedRows] = await client.query({
    query: `
      SELECT
        script_id,
        snapshot_date,
        title,
        hook,
        body,
        cta,
        story_text,
        inspiration_sources,
        created_at
      FROM \`${projectId}.${dataset}.my_reels_scripts\`
      QUALIFY ROW_NUMBER() OVER (PARTITION BY script_id ORDER BY created_at DESC) = 1
      ORDER BY created_at DESC, script_id ASC
      LIMIT 100
    `,
    location,
  });

  // 自分のリール
  const [selfRows] = await client.query({
    query: `
      WITH latest_reels AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY instagram_id ORDER BY snapshot_at DESC) AS rn
        FROM \`${projectId}.${dataset}.instagram_reel_metric_snapshots\`
      ),
      latest_transcripts AS (
        SELECT instagram_id, segments_json, raw_text
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY instagram_id ORDER BY transcribed_at DESC) AS rn
          FROM \`${projectId}.${dataset}.instagram_reel_transcripts\`
        )
        WHERE rn = 1
      )
      SELECT
        r.instagram_id, r.permalink, r.thumbnail_url, r.caption, r.timestamp AS posted_at,
        r.views, r.likes, r.duration_seconds,
        r.ig_reels_avg_watch_time_ms,
        r.completion_rate,
        t.segments_json, t.raw_text
      FROM latest_reels r
      LEFT JOIN latest_transcripts t ON r.instagram_id = t.instagram_id
      WHERE r.rn = 1 AND t.segments_json IS NOT NULL
      ORDER BY r.timestamp DESC
      LIMIT 100
    `,
    location,
  });

  // 競合の文字起こし + メタ
  const [compRows] = await client.query({
    query: `
      WITH latest_transcripts AS (
        SELECT instagram_media_id, username, segments_json, raw_text,
          ROW_NUMBER() OVER (PARTITION BY instagram_media_id ORDER BY transcribed_at DESC) AS rn
        FROM \`${projectId}.${dataset}.competitor_reels_transcripts\`
        WHERE segments_json IS NOT NULL
      ),
      reel_meta AS (
        SELECT
          username, instagram_media_id,
          ARRAY_AGG(permalink IGNORE NULLS ORDER BY created_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS permalink,
          ARRAY_AGG(IFNULL(sheet_caption, caption) IGNORE NULLS ORDER BY created_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS caption,
          ARRAY_AGG(drive_file_url ORDER BY IF(REGEXP_CONTAINS(drive_file_url, r'(drive\\.google\\.com|storage\\.googleapis\\.com)'), 1, 0) DESC, created_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS drive_file_url,
          MAX(posted_at) AS posted_at,
          MAX(view_count) AS view_count,
          MAX(like_count) AS like_count
        FROM \`${projectId}.${dataset}.competitor_reels_raw\`
        GROUP BY username, instagram_media_id
      )
      SELECT
        t.username, t.instagram_media_id, t.segments_json, t.raw_text,
        m.permalink, m.caption, m.drive_file_url, m.posted_at, m.view_count, m.like_count
      FROM latest_transcripts t
      LEFT JOIN reel_meta m
        ON t.instagram_media_id = m.instagram_media_id
        AND t.username = m.username
      WHERE t.rn = 1
      ORDER BY m.view_count DESC NULLS LAST
      LIMIT 200
    `,
    location,
  });

  const parseSegments = (raw: unknown): ScriptSegment[] => {
    if (!raw) return [];
    try {
      const arr = JSON.parse(String(raw)) as Array<Record<string, unknown>>;
      if (!Array.isArray(arr)) return [];
      return arr.map((s) => ({
        start: Number(s.start ?? 0),
        end: Number(s.end ?? 0),
        text: String(s.text ?? '').trim(),
      }));
    } catch {
      return [];
    }
  };

  const tsToString = (raw: unknown): string | null => {
    if (!raw) return null;
    if (typeof raw === 'object' && 'value' in (raw as object)) return String((raw as { value: string }).value);
    return String(raw);
  };

  const generatedScripts: GeneratedScriptEntry[] = (generatedRows as Array<Record<string, unknown>>).map((row) => ({
    scriptId: String(row.script_id ?? ''),
    snapshotDate: tsToString(row.snapshot_date) ?? '',
    title: String(row.title ?? ''),
    hook: String(row.hook ?? ''),
    body: String(row.body ?? ''),
    cta: String(row.cta ?? ''),
    storyText: String(row.story_text ?? ''),
    inspirationSources: Array.isArray(row.inspiration_sources)
      ? row.inspiration_sources.map(String).filter(Boolean)
      : [],
    createdAt: tsToString(row.created_at),
  }));

  const selfEntries: ScriptEntry[] = (selfRows as Array<Record<string, unknown>>).map((row) => {
    const avgMs = row.ig_reels_avg_watch_time_ms !== null && row.ig_reels_avg_watch_time_ms !== undefined ? Number(row.ig_reels_avg_watch_time_ms) : null;
    return {
      source: 'self',
      username: 'kudooo_ai',
      instagramId: String(row.instagram_id),
      permalink: row.permalink ? String(row.permalink) : null,
      thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
      caption: row.caption ? String(row.caption) : null,
      postedAt: tsToString(row.posted_at),
      views: row.views !== null && row.views !== undefined ? Number(row.views) : null,
      likes: row.likes !== null && row.likes !== undefined ? Number(row.likes) : null,
      durationSeconds: row.duration_seconds !== null && row.duration_seconds !== undefined ? Number(row.duration_seconds) : null,
      avgWatchTimeSeconds: avgMs !== null ? avgMs / 1000 : null,
      completionRate: row.completion_rate !== null && row.completion_rate !== undefined ? Number(row.completion_rate) : null,
      transcriptSegments: parseSegments(row.segments_json),
      rawText: row.raw_text ? String(row.raw_text) : '',
    };
  });

  const compEntries: ScriptEntry[] = (compRows as Array<Record<string, unknown>>).map((row) => ({
    source: 'competitor',
    username: String(row.username ?? ''),
    instagramId: String(row.instagram_media_id ?? ''),
    permalink: row.permalink ? String(row.permalink) : null,
    thumbnailUrl: row.drive_file_url ? String(row.drive_file_url) : null,
    caption: row.caption ? String(row.caption) : null,
    postedAt: tsToString(row.posted_at),
    views: row.view_count !== null && row.view_count !== undefined ? Number(row.view_count) : null,
    likes: row.like_count !== null && row.like_count !== undefined ? Number(row.like_count) : null,
    durationSeconds: null,
    avgWatchTimeSeconds: null,
    completionRate: null,
    transcriptSegments: parseSegments(row.segments_json),
    rawText: row.raw_text ? String(row.raw_text) : '',
  }));

  return {
    generatedScripts,
    generatedCount: generatedScripts.length,
    entries: [...selfEntries, ...compEntries],
    selfCount: selfEntries.length,
    competitorCount: compEntries.length,
  };
}
