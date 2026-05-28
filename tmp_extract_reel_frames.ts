import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { BigQuery } from '@google-cloud/bigquery';
import { getInstagramAccessContext } from '/Users/kudo/AutoStudio/src/lib/instagram/auth';
import { fetchAllReelsSince } from '/Users/kudo/AutoStudio/src/lib/instagram/reelMetrics';

async function main() {
  const outDir = '/private/tmp/reel_frame_review';
  mkdirSync(outDir, { recursive: true });

  const bq = new BigQuery({ projectId: 'mark-454114' });
  const [rows] = await bq.query({
    query: `
    WITH latest AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY instagram_id ORDER BY snapshot_at DESC) rn
      FROM \`mark-454114.autostudio_instagram.instagram_reel_metric_snapshots\`
    ),
    tr AS (
      SELECT instagram_id, raw_text, ROW_NUMBER() OVER (PARTITION BY instagram_id ORDER BY transcribed_at DESC) rn
      FROM \`mark-454114.autostudio_instagram.instagram_reel_transcripts\`
    )
    SELECT
      l.instagram_id,
      CAST(l.timestamp AS STRING) AS posted_at,
      l.permalink,
      l.views,
      l.reach,
      l.reels_skip_rate,
      ROUND(l.ig_reels_avg_watch_time_ms / 1000, 2) AS avg_watch_sec,
      l.duration_seconds,
      ROUND(l.completion_rate * 100, 1) AS completion_pct,
      l.likes,
      l.comments,
      l.saved,
      l.shares,
      tr.raw_text,
      l.caption
    FROM latest l
    LEFT JOIN tr ON tr.instagram_id = l.instagram_id AND tr.rn = 1
    WHERE l.rn = 1
    ORDER BY l.timestamp DESC
  `,
    location: 'asia-northeast1',
  });

  const context = await getInstagramAccessContext('kudooo_ai');
  const media = await fetchAllReelsSince(context, '2025-01-01T00:00:00Z', 100, 10);
  const mediaById = new Map(media.map((m) => [m.id, m]));

  const report = [];
  for (const [index, row] of rows.entries()) {
    const id = String(row.instagram_id);
    const item = mediaById.get(id);
    const prefix = `${String(index + 1).padStart(2, '0')}_${id}`;
    const shots: string[] = [];

    if (item?.media_url) {
      for (const [label, second] of [['00', 0.5], ['03', 3], ['08', 8]] as const) {
        const out = `${outDir}/${prefix}_${label}s.jpg`;
        const ff = spawnSync('ffmpeg', [
          '-hide_banner',
          '-loglevel', 'error',
          '-y',
          '-ss', String(second),
          '-i', item.media_url,
          '-frames:v', '1',
          '-q:v', '2',
          out,
        ], { encoding: 'utf8', timeout: 30000 });
        if (ff.status === 0) shots.push(out);
      }
    }

    report.push({
      order: index + 1,
      instagram_id: id,
      posted_at: row.posted_at,
      permalink: row.permalink,
      views: Number(row.views ?? 0),
      reach: Number(row.reach ?? 0),
      skip_rate: row.reels_skip_rate === null ? null : Number(row.reels_skip_rate),
      avg_watch_sec: row.avg_watch_sec === null ? null : Number(row.avg_watch_sec),
      duration_sec: row.duration_seconds === null ? null : Number(row.duration_seconds),
      completion_pct: row.completion_pct === null ? null : Number(row.completion_pct),
      likes: Number(row.likes ?? 0),
      comments: Number(row.comments ?? 0),
      saves: Number(row.saved ?? 0),
      shares: Number(row.shares ?? 0),
      opening_text: String(row.raw_text || row.caption || '').replace(/\s+/g, ' ').slice(0, 260),
      shots,
    });
  }

  writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outDir, count: report.length, frames: report.reduce((sum, r) => sum + r.shots.length, 0) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
