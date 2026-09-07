import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInstagramBigQuery, ensureInstagramTables, getInstagramStorageConfig } from '@/lib/instagram/bigquery';
import { selectCompetitorDownloads } from '@/lib/instagram/competitorDownloadSelection';
import {
  buildCompetitorReelChapters,
  deriveCompetitorReelTitle,
  type CompetitorTranscriptSegmentInput,
} from '@/lib/instagram/competitorTranscript';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const OUTPUT_ROOT = path.resolve(
  process.env.IG_COMPETITOR_TRANSCRIPT_OUTPUT_DIR ?? 'output/instagram-transcripts/competitors',
);
const LOCAL_VIDEO_DIR = process.env.IG_COMPETITOR_LOCAL_VIDEO_DIR
  ? path.resolve(process.env.IG_COMPETITOR_LOCAL_VIDEO_DIR)
  : null;
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? '/opt/homebrew/bin/ffmpeg';
const MLX_WHISPER_BIN = process.env.MLX_WHISPER_BIN ?? '/Users/kudo/.local/bin/mlx_whisper';
const WHISPER_MODEL = process.env.IG_COMPETITOR_WHISPER_MODEL ?? 'mlx-community/whisper-large-v3-turbo';
const DEFAULT_LIMIT = 60;
const DEFAULT_MINIMUM_PER_ACCOUNT = 5;
const DEFAULT_CONCURRENCY = 2;

interface CompetitorReel {
  username: string;
  instagramMediaId: string;
  driveFileId: string;
  driveFileUrl: string;
  caption: string | null;
  permalink: string | null;
  postedAt: string;
  viewCount: number | null;
}

interface WhisperWord {
  word?: string;
  start?: number;
  end?: number;
}

interface WhisperSegment {
  start?: number;
  end?: number;
  text?: string;
  words?: WhisperWord[];
}

interface WhisperOutput {
  segments?: WhisperSegment[];
}

function parseIntegerFlag(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const value = Number(index >= 0 ? process.argv[index + 1] : fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function parseStringFlag(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? '').trim() || null : null;
}

function timestampValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    return String((value as { value: unknown }).value);
  }
  return String(value ?? '');
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timeout after ${Math.round(timeoutMs / 60_000)} minutes: ${command}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk.toString()}`.slice(-65_536); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk.toString()}`.slice(-65_536); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${path.basename(command)} exited with ${code}: ${stderr.slice(-2_000)}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function applyVocabularyCorrections(value: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/スレッツ/g, 'スレッズ'],
    [/スレットズ/g, 'スレッズ'],
    [/インスタグラム/gi, 'Instagram'],
    [/チャットGPT/gi, 'ChatGPT'],
    [/ジェミニー|ジェミニ/gi, 'Gemini'],
    [/クロードコード/g, 'Claude Code'],
    [/クロード/g, 'Claude'],
  ];
  let text = value;
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, ' ').trim();
}

function parseWhisperSegments(filePath: string): CompetitorTranscriptSegmentInput[] {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as WhisperOutput;
  const whisperSegments = Array.isArray(payload.segments) ? payload.segments : [];
  const words = whisperSegments.flatMap((segment) => (
    Array.isArray(segment.words) ? segment.words : []
  )).filter((word) => (
    typeof word.word === 'string' && Number.isFinite(word.start) && Number.isFinite(word.end)
  ));

  if (words.length) {
    const result: CompetitorTranscriptSegmentInput[] = [];
    let current: WhisperWord[] = [];
    for (const word of words) {
      current.push(word);
      const start = Number(current[0]?.start ?? 0);
      const end = Number(word.end ?? start);
      const text = current.map((item) => item.word ?? '').join('').trim();
      if ((end - start >= 7 && /[。！？!?]$/u.test(text)) || end - start >= 14) {
        result.push({ start, end, text: applyVocabularyCorrections(text) });
        current = [];
      }
    }
    if (current.length) {
      const start = Number(current[0]?.start ?? 0);
      const end = Number(current.at(-1)?.end ?? start);
      const text = applyVocabularyCorrections(current.map((item) => item.word ?? '').join(''));
      if (text) result.push({ start, end, text });
    }
    return result.filter((segment) => segment.text.length > 0 && segment.end >= segment.start);
  }

  return whisperSegments.map((segment) => ({
    start: Number(segment.start ?? 0),
    end: Number(segment.end ?? 0),
    text: applyVocabularyCorrections(String(segment.text ?? '')),
  })).filter((segment) => segment.text.length > 0 && segment.end >= segment.start);
}

async function loadTargets(limit: number, minimumPerAccount: number): Promise<CompetitorReel[]> {
  const bigquery = createInstagramBigQuery();
  const { projectId, dataset, location } = getInstagramStorageConfig();
  const [rows] = await bigquery.query({
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
          ARRAY_AGG(r.drive_file_id ORDER BY r.created_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS drive_file_id,
          ARRAY_AGG(r.drive_file_url ORDER BY r.created_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS drive_file_url,
          ARRAY_AGG(r.caption IGNORE NULLS ORDER BY r.created_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS caption,
          ARRAY_AGG(r.permalink IGNORE NULLS ORDER BY r.created_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS permalink,
          MAX(r.posted_at) AS posted_at,
          MAX(r.view_count) AS view_count
        FROM \`${projectId}.${dataset}.competitor_reels_raw\` r
        JOIN active_competitors a USING (username)
        WHERE DATE(r.posted_at, 'Asia/Tokyo') >= DATE_SUB(CURRENT_DATE('Asia/Tokyo'), INTERVAL 120 DAY)
          AND r.drive_file_url LIKE '%storage.googleapis.com%'
        GROUP BY r.username, r.instagram_media_id
      )
      SELECT * FROM unique_reels
    `,
    location,
  });
  const candidates = (rows as Array<Record<string, unknown>>).map((row) => ({
    username: String(row.username),
    instagramMediaId: String(row.instagram_media_id),
    driveFileId: String(row.drive_file_id),
    driveFileUrl: String(row.drive_file_url),
    caption: row.caption ? String(row.caption) : null,
    permalink: row.permalink ? String(row.permalink) : null,
    postedAt: timestampValue(row.posted_at),
    viewCount: row.view_count == null ? null : Number(row.view_count),
  }));
  return selectCompetitorDownloads(candidates, limit, minimumPerAccount);
}

async function resolveVideo(reel: CompetitorReel, videoDirectory: string): Promise<string> {
  const cachedPath = LOCAL_VIDEO_DIR
    ? path.join(LOCAL_VIDEO_DIR, `${reel.username}_${reel.instagramMediaId}.mp4`)
    : null;
  if (cachedPath && fs.existsSync(cachedPath)) return cachedPath;

  const videoPath = path.join(videoDirectory, 'video.mp4');
  if (fs.existsSync(videoPath)) return videoPath;
  const response = await fetch(reel.driveFileUrl);
  if (!response.ok) throw new Error(`video download failed: HTTP ${response.status}`);
  await fs.promises.writeFile(videoPath, Buffer.from(await response.arrayBuffer()));
  return videoPath;
}

async function transcribe(reel: CompetitorReel, force: boolean): Promise<{
  segments: CompetitorTranscriptSegmentInput[];
  chapters: ReturnType<typeof buildCompetitorReelChapters>;
  title: string;
  rawText: string;
}> {
  const videoDirectory = path.join(OUTPUT_ROOT, reel.instagramMediaId);
  fs.mkdirSync(videoDirectory, { recursive: true });
  const transcriptJson = path.join(videoDirectory, 'transcript.json');
  if (force) {
    for (const extension of ['json', 'txt', 'srt', 'tsv', 'vtt']) {
      fs.rmSync(path.join(videoDirectory, `transcript.${extension}`), { force: true });
    }
  }
  if (!fs.existsSync(transcriptJson)) {
    const videoPath = await resolveVideo(reel, videoDirectory);
    const wavPath = path.join(videoDirectory, 'audio16k.wav');
    if (!fs.existsSync(wavPath)) {
      await runProcess(FFMPEG_BIN, [
        '-y', '-hide_banner', '-loglevel', 'error', '-i', videoPath,
        '-vn', '-ac', '1', '-ar', '16000', wavPath,
      ], 10 * 60_000);
    }
    await runProcess(MLX_WHISPER_BIN, [
      wavPath,
      '--model', WHISPER_MODEL,
      '--language', 'ja',
      '--word-timestamps', 'True',
      '--output-format', 'all',
      '--output-dir', videoDirectory,
      '--output-name', 'transcript',
      '--verbose', 'False',
    ], 45 * 60_000);
  }

  const segments = parseWhisperSegments(transcriptJson);
  if (!segments.length) throw new Error('Whisper returned no transcript segments');
  const rawText = segments.map((segment) => segment.text).join(' ');
  if (/固有語(?:[・\s]*固有語){3,}|スレッズ（スレッズ（スレッズ/u.test(rawText)) {
    throw new Error('Whisper produced a repeated prompt hallucination');
  }
  const title = deriveCompetitorReelTitle(segments, reel.caption ?? '');
  const chapters = buildCompetitorReelChapters(segments);
  fs.writeFileSync(path.join(videoDirectory, 'transcript.cleaned.txt'), `${rawText}\n`, 'utf8');
  fs.writeFileSync(path.join(videoDirectory, 'chapters.json'), `${JSON.stringify(chapters, null, 2)}\n`, 'utf8');
  return { segments, chapters, title, rawText };
}

async function saveTranscript(
  reel: CompetitorReel,
  result: Awaited<ReturnType<typeof transcribe>>,
  replace: boolean,
): Promise<void> {
  const bigquery = createInstagramBigQuery();
  const { projectId, dataset, location } = getInstagramStorageConfig();
  const now = new Date().toISOString();
  if (replace) {
    await bigquery.query({
      query: `DELETE FROM \`${projectId}.${dataset}.competitor_reels_transcripts\`
        WHERE instagram_media_id = @instagram_media_id`,
      params: { instagram_media_id: reel.instagramMediaId },
      location,
    });
  }
  await bigquery.query({
    query: `
      INSERT INTO \`${projectId}.${dataset}.competitor_reels_transcripts\` (
        snapshot_date, instagram_media_id, drive_file_id, summary, key_points, hooks, cta_ideas,
        created_at, username, posted_at, transcribed_at, model_name, segments_json, chapters_json, raw_text, caption
      ) VALUES (
        CURRENT_DATE('Asia/Tokyo'), @instagram_media_id, @drive_file_id, @summary, [], [], [],
        TIMESTAMP(@now), @username, TIMESTAMP(@posted_at), TIMESTAMP(@now), @model_name,
        @segments_json, @chapters_json, @raw_text, @caption
      )
    `,
    params: {
      instagram_media_id: reel.instagramMediaId,
      drive_file_id: reel.driveFileId,
      summary: result.title,
      now,
      username: reel.username,
      posted_at: reel.postedAt,
      model_name: WHISPER_MODEL,
      segments_json: JSON.stringify(result.segments),
      chapters_json: JSON.stringify(result.chapters),
      raw_text: result.rawText,
      caption: reel.caption,
    },
    location,
  });
}

async function main(): Promise<void> {
  if (!fs.existsSync(MLX_WHISPER_BIN)) throw new Error(`mlx_whisper not found: ${MLX_WHISPER_BIN}`);
  if (!fs.existsSync(FFMPEG_BIN)) throw new Error(`ffmpeg not found: ${FFMPEG_BIN}`);
  const limit = parseIntegerFlag('--limit', DEFAULT_LIMIT);
  const minimumPerAccount = parseIntegerFlag('--min-per-account', DEFAULT_MINIMUM_PER_ACCOUNT);
  const concurrency = parseIntegerFlag('--concurrency', DEFAULT_CONCURRENCY);
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const mediaId = parseStringFlag('--media-id');
  const mediaIds = new Set((parseStringFlag('--media-ids') ?? '').split(',').filter(Boolean));
  const bigquery = createInstagramBigQuery();
  await ensureInstagramTables(bigquery);
  const { projectId, dataset, location } = getInstagramStorageConfig();
  const selected = (await loadTargets(limit, minimumPerAccount))
    .filter((reel) => (
      (!mediaId && mediaIds.size === 0)
      || reel.instagramMediaId === mediaId
      || mediaIds.has(reel.instagramMediaId)
    ));
  const [existingRows] = await bigquery.query({
    query: `SELECT DISTINCT instagram_media_id FROM \`${projectId}.${dataset}.competitor_reels_transcripts\`
      WHERE segments_json IS NOT NULL AND segments_json != '[]'`,
    location,
  });
  const done = new Set((existingRows as Array<{ instagram_media_id: string }>).map((row) => row.instagram_media_id));
  const targets = force ? selected : selected.filter((reel) => !done.has(reel.instagramMediaId));
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  console.info(`[transcribe-competitors] selected=${selected.length}, pending=${targets.length}, already=${selected.length - targets.length}`);
  if (dryRun || !targets.length) return;

  const queue = [...targets];
  let completed = 0;
  let failed = 0;
  async function worker(workerId: number): Promise<void> {
    while (queue.length) {
      const reel = queue.shift();
      if (!reel) return;
      try {
        console.info(`[W${workerId}] TRANSCRIBE ${reel.username}/${reel.instagramMediaId}`);
        const result = await transcribe(reel, force);
        await saveTranscript(reel, result, force);
        completed += 1;
        console.info(`[W${workerId}] COMPLETE ${reel.username}/${reel.instagramMediaId} title="${result.title}" chapters=${result.chapters.length} segments=${result.segments.length}`);
      } catch (error) {
        failed += 1;
        console.error(`[W${workerId}] FAILED ${reel.username}/${reel.instagramMediaId}: ${error instanceof Error ? error.message : String(error)}`);
      }
      console.info(`[transcribe-competitors] progress ${completed}/${targets.length}, failed=${failed}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(targets.length, 1)) }, (_, index) => worker(index + 1)));
  console.info(`[transcribe-competitors] Done. ${completed} complete, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[transcribe-competitors] Fatal:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
