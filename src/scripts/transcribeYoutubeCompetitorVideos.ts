import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import {
  createYoutubeBigQueryContext,
  ensureYoutubeTables,
  type YoutubeBigQueryContext,
} from '@/lib/youtube/bigquery';
import {
  upsertYoutubeVideoTranscript,
  type YoutubeTranscriptChapter,
  type YoutubeTranscriptSegment,
} from '@/lib/youtube/transcripts';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const DATASET_ID = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';
const OUTPUT_ROOT = path.resolve(
  process.env.YOUTUBE_TRANSCRIPT_OUTPUT_DIR ?? 'output/youtube-transcripts/threads',
);
const YT_DLP_BIN = process.env.YT_DLP_BIN ?? '/opt/homebrew/bin/yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? '/opt/homebrew/bin/ffmpeg';
const MLX_WHISPER_BIN = process.env.MLX_WHISPER_BIN ?? '/Users/kudo/.local/bin/mlx_whisper';
const WHISPER_MODEL = process.env.YOUTUBE_WHISPER_MODEL ?? 'mlx-community/whisper-large-v3-turbo';
const DEFAULT_CONCURRENCY = 2;
const EXCLUDED_VIDEO_IDS = new Map([
  ['6v9n2QYfqMA', 'せいやの対談動画（ユーザー指定で除外）'],
  ['Fkz10Ej8r-o', 'ここなの緊急LIVE（ユーザー指定で除外）'],
]);

interface TargetVideo {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  durationSeconds: number;
  viewCount: number;
  subscriberCount: number | null;
  performanceRatio: number | null;
  publishedAt: string;
}

interface VideoStatus extends TargetVideo {
  url: string;
  status: 'pending' | 'running' | 'complete' | 'failed' | 'excluded';
  outputDirectory?: string;
  error?: string;
  updatedAt: string;
}

function parseIntegerFlag(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const raw = index >= 0 ? process.argv[index + 1] : undefined;
  const value = Number(raw ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function timestampValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    return String((value as { value: unknown }).value);
  }
  return String(value ?? '');
}

async function loadTargetVideos(): Promise<{ targets: TargetVideo[]; excluded: TargetVideo[] }> {
  const projectId = resolveProjectId();
  const bigquery = createBigQueryClient(projectId);
  const [rows] = await bigquery.query({
    query: `
      WITH active_competitors AS (
        SELECT channel_id, channel_title
        FROM \`${projectId}.${DATASET_ID}.youtube_competitors\`
        WHERE active = TRUE AND category = 'threads'
      ),
      latest_channels AS (
        SELECT channel_id, channel_title, subscriber_count
        FROM (
          SELECT
            c.channel_id,
            c.channel_title,
            c.subscriber_count,
            ROW_NUMBER() OVER (PARTITION BY c.channel_id ORDER BY c.collected_at DESC) AS rn
          FROM \`${projectId}.${DATASET_ID}.media_channels_snapshot\` c
          JOIN active_competitors a USING (channel_id)
          WHERE c.media = 'youtube'
        )
        WHERE rn = 1
      ),
      latest_videos AS (
        SELECT * EXCEPT(rn)
        FROM (
          SELECT
            v.*,
            ROW_NUMBER() OVER (PARTITION BY v.content_id ORDER BY v.collected_at DESC) AS rn
          FROM \`${projectId}.${DATASET_ID}.media_videos_snapshot\` v
          JOIN active_competitors a USING (channel_id)
          WHERE v.media = 'youtube'
            AND v.published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 730 DAY)
        )
        WHERE rn = 1
      )
      SELECT
        v.content_id AS video_id,
        v.title,
        v.channel_id,
        COALESCE(c.channel_title, a.channel_title, v.channel_id) AS channel_title,
        v.duration_seconds,
        v.view_count,
        c.subscriber_count,
        SAFE_DIVIDE(v.view_count, NULLIF(c.subscriber_count, 0)) AS performance_ratio,
        v.published_at
      FROM latest_videos v
      JOIN active_competitors a USING (channel_id)
      LEFT JOIN latest_channels c USING (channel_id)
      WHERE REGEXP_CONTAINS(LOWER(IFNULL(v.title, '')), r'(threads|\u30b9\u30ec\u30c3\u30ba)')
        AND v.duration_seconds >= 900
        AND (
          v.view_count >= 10000
          OR (
            v.view_count >= 1000
            AND SAFE_DIVIDE(v.view_count, NULLIF(c.subscriber_count, 0)) >= 1
          )
        )
      ORDER BY performance_ratio DESC NULLS LAST, view_count DESC NULLS LAST
    `,
  });

  const videos = (rows as Array<Record<string, unknown>>).map((row) => ({
    videoId: String(row.video_id),
    title: String(row.title ?? ''),
    channelId: String(row.channel_id),
    channelTitle: String(row.channel_title ?? row.channel_id),
    durationSeconds: Number(row.duration_seconds ?? 0),
    viewCount: Number(row.view_count ?? 0),
    subscriberCount: row.subscriber_count == null ? null : Number(row.subscriber_count),
    performanceRatio: row.performance_ratio == null ? null : Number(row.performance_ratio),
    publishedAt: timestampValue(row.published_at),
  }));

  return {
    targets: videos.filter((video) => !EXCLUDED_VIDEO_IDS.has(video.videoId)),
    excluded: videos.filter((video) => EXCLUDED_VIDEO_IDS.has(video.videoId)),
  };
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

    child.stdout.on('data', (chunk) => {
      stdout = `${stdout}${chunk.toString()}`.slice(-65_536);
    });
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-65_536);
    });
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

function findAudioFile(videoDirectory: string): string | null {
  if (!fs.existsSync(videoDirectory)) return null;
  const audio = fs.readdirSync(videoDirectory).find((name) => (
    name.startsWith('audio.') && !name.endsWith('.part') && name !== 'audio16k.wav'
  ));
  return audio ? path.join(videoDirectory, audio) : null;
}

function isComplete(videoDirectory: string): boolean {
  return ['transcript.txt', 'transcript.json', 'transcript.srt', 'transcript.vtt'].every((name) => (
    fs.existsSync(path.join(videoDirectory, name))
  ));
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function applyVocabularyCorrections(value: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\u30b9\u30ec\u30c3\u30c4/g, '\u30b9\u30ec\u30c3\u30ba'],
    [/\u30b9\u30ec\u30c3\u30c8\u30ba/g, '\u30b9\u30ec\u30c3\u30ba'],
    [/\u30af\u30ed\u30fc\u30c9\u30b3\u30fc\u30c9/g, 'Claude Code'],
    [/\u30c1\u30e3\u30c3\u30c8GPT/gi, 'ChatGPT'],
  ];
  let text = value;
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return text;
}

function writeCleanedTranscript(videoDirectory: string): void {
  const rawPath = path.join(videoDirectory, 'transcript.txt');
  const cleanedPath = path.join(videoDirectory, 'transcript.cleaned.txt');
  const text = applyVocabularyCorrections(fs.readFileSync(rawPath, 'utf8'));
  fs.writeFileSync(cleanedPath, text, 'utf8');
}

function inferChapterTitle(text: string, index: number): string {
  if (index === 0) return '\u30aa\u30fc\u30d7\u30cb\u30f3\u30b0';
  const rules: Array<[RegExp, string]> = [
    [/\u81ea\u5df1\u7d39\u4ecb|\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb\u3092\u7d39\u4ecb/, '\u81ea\u5df1\u7d39\u4ecb'],
    [/\u76ee\u6b21|\u5168\u4f53\u50cf|\u4eca\u56de.{0,12}(\u6d41\u308c|\u5185\u5bb9)/, '\u3053\u306e\u52d5\u753b\u306e\u5168\u4f53\u50cf'],
    [/\u307e\u3068\u3081|\u6700\u5f8c\u306b|\u304a\u3055\u3089\u3044|\u7dcf\u62ec/, '\u307e\u3068\u3081'],
    [/Threads.{0,12}(\u3068\u306f|\u7279\u5fb4|\u4ed5\u7d44\u307f)|\u30b9\u30ec\u30c3\u30ba.{0,12}(\u3068\u306f|\u7279\u5fb4|\u4ed5\u7d44\u307f)/i, 'Threads\u306e\u57fa\u790e'],
    [/\u30b8\u30e3\u30f3\u30eb/, '\u30b8\u30e3\u30f3\u30eb\u9078\u5b9a'],
    [/\u30ea\u30b5\u30fc\u30c1|\u7af6\u5408\u8abf\u67fb/, '\u30ea\u30b5\u30fc\u30c1'],
    [/\u30b3\u30f3\u30bb\u30d7\u30c8|\u30bf\u30fc\u30b2\u30c3\u30c8/, '\u30b3\u30f3\u30bb\u30d7\u30c8\u8a2d\u8a08'],
    [/\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb|\u30d7\u30ed\u30d5|\u81ea\u5df1\u7d39\u4ecb\u6587/, '\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb\u8a2d\u8a08'],
    [/\u30a2\u30ab\u30a6\u30f3\u30c8.{0,12}(\u4f5c|\u8a2d\u8a08|\u8a2d\u5b9a)/, '\u30a2\u30ab\u30a6\u30f3\u30c8\u8a2d\u8a08'],
    [/\u697d\u5929.{0,12}\u30a2\u30d5\u30a3\u30ea\u30a8\u30a4\u30c8/, '\u697d\u5929\u30a2\u30d5\u30a3\u30ea\u30a8\u30a4\u30c8'],
    [/note.{0,12}(\u53ce\u76ca|\u8ca9\u58f2|\u7a3c|\u4f5c)/i, 'note\u3067\u306e\u53ce\u76ca\u5316'],
    [/\u5c0e\u7dda|\u30ea\u30f3\u30af.{0,8}(\u8a2d\u7f6e|\u8a2d\u5b9a)|\u8ca9\u58f2\u5c0e\u7dda/, '\u53ce\u76ca\u5c0e\u7dda\u306e\u8a2d\u8a08'],
    [/\u53ce\u76ca\u5316|\u7a3c\u3050|\u58f2\u4e0a|\u30de\u30cd\u30bf\u30a4\u30ba/, '\u53ce\u76ca\u5316\u65b9\u6cd5'],
    [/\u30d0\u30ba|\u4f38\u3073\u308b|\u4f38\u3070\u3059|\u6295\u7a3f.{0,12}(\u4f5c|\u66f8|\u578b)/, '\u4f38\u3073\u308b\u6295\u7a3f\u306e\u4f5c\u308a\u65b9'],
    [/\u904b\u7528|\u7d99\u7d9a|\u6295\u7a3f\u983b\u5ea6/, '\u30a2\u30ab\u30a6\u30f3\u30c8\u904b\u7528'],
    [/ChatGPT|Claude|AI.{0,12}(\u6d3b\u7528|\u4f7f|\u751f\u6210)/i, 'AI\u306e\u6d3b\u7528\u65b9\u6cd5'],
    [/\u6ce8\u610f|\u5931\u6557|\u3084\u3063\u3066\u306f\u3044\u3051\u306a\u3044/, '\u6ce8\u610f\u70b9\u3068\u5931\u6557\u4f8b'],
  ];
  for (const [pattern, title] of rules) {
    if (pattern.test(text)) return title;
  }
  const excerpt = text
    .replace(/^.*?(?:\u307e\u305a|\u6b21\u306b|\u7d9a\u3044\u3066|\u3053\u3053\u304b\u3089|\u305d\u308c\u3067\u306f)[\u3001\s]*/, '')
    .split(/[\u3002\uff01\uff1f!?]/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  return excerpt ? excerpt.slice(0, 30) : `\u30d1\u30fc\u30c8${index + 1}`;
}

function buildAutomaticChapters(
  segments: YoutubeTranscriptSegment[],
  durationSeconds: number,
): YoutubeTranscriptChapter[] {
  if (!segments.length) return [];
  const transition = /(?:\u307e\u305a|\u6b21\u306b|\u7d9a\u3044\u3066|\u3053\u3053\u304b\u3089|\u305d\u308c\u3067\u306f|\u30b9\u30c6\u30c3\u30d7|\u7b2c[0-9\uff10-\uff19\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d]+|\u307e\u3068\u3081|\u6700\u5f8c\u306b)/;
  const starts = [0];
  let lastStart = 0;
  for (const segment of segments) {
    const elapsed = segment.start - lastStart;
    if (elapsed < 180) continue;
    if (elapsed >= 480 || transition.test(segment.text)) {
      starts.push(segment.start);
      lastStart = segment.start;
    }
  }
  const duration = Math.max(durationSeconds, segments.at(-1)?.end ?? 0);
  if (starts.length > 1 && duration - starts.at(-1)! < 90) starts.pop();
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? duration;
    const context = segments
      .filter((segment) => segment.start >= start && segment.start < Math.min(end, start + 90))
      .map((segment) => segment.text)
      .join(' ');
    return { start, end, title: inferChapterTitle(context, index) };
  });
}

async function resolveChapters(
  video: TargetVideo,
  videoDirectory: string,
  segments: YoutubeTranscriptSegment[],
): Promise<{ chapters: YoutubeTranscriptChapter[]; source: 'youtube' | 'auto' }> {
  const chaptersPath = path.join(videoDirectory, 'chapters.json');
  if (fs.existsSync(chaptersPath)) {
    const stored = JSON.parse(fs.readFileSync(chaptersPath, 'utf8')) as {
      source?: 'youtube' | 'auto';
      chapters?: YoutubeTranscriptChapter[];
    };
    if (stored.chapters?.length) {
      return { chapters: stored.chapters, source: stored.source === 'youtube' ? 'youtube' : 'auto' };
    }
  }

  const source = 'auto' as const;
  const chapters = buildAutomaticChapters(segments, video.durationSeconds);
  writeJson(chaptersPath, { source, chapters, generatedAt: new Date().toISOString() });
  return { chapters, source };
}

async function uploadTranscript(
  context: YoutubeBigQueryContext,
  video: TargetVideo,
  videoDirectory: string,
): Promise<void> {
  const whisperOutput = JSON.parse(
    fs.readFileSync(path.join(videoDirectory, 'transcript.json'), 'utf8'),
  ) as { language?: string; segments?: Array<Record<string, unknown>> };
  const segments: YoutubeTranscriptSegment[] = (whisperOutput.segments ?? [])
    .map((segment) => ({
      start: Number(segment.start ?? 0),
      end: Number(segment.end ?? 0),
      text: applyVocabularyCorrections(String(segment.text ?? '')).trim(),
    }))
    .filter((segment) => segment.text.length > 0);
  const metadataPath = path.join(videoDirectory, 'metadata.json');
  const metadata = fs.existsSync(metadataPath)
    ? JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as { completedAt?: string }
    : {};
  const { chapters, source: chapterSource } = await resolveChapters(video, videoDirectory, segments);
  const now = new Date().toISOString();
  await upsertYoutubeVideoTranscript(context, {
    videoId: video.videoId,
    sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
    language: whisperOutput.language ?? 'ja',
    model: WHISPER_MODEL,
    status: 'complete',
    rawText: fs.readFileSync(path.join(videoDirectory, 'transcript.txt'), 'utf8'),
    cleanedText: fs.readFileSync(path.join(videoDirectory, 'transcript.cleaned.txt'), 'utf8'),
    segments,
    chapters,
    chapterSource,
    transcribedAt: metadata.completedAt ?? now,
    updatedAt: now,
  });
}

async function transcribeVideo(
  context: YoutubeBigQueryContext,
  video: TargetVideo,
  workerId: number,
): Promise<void> {
  const videoDirectory = path.join(OUTPUT_ROOT, video.videoId);
  fs.mkdirSync(videoDirectory, { recursive: true });
  const url = `https://www.youtube.com/watch?v=${video.videoId}`;
  const metadataPath = path.join(videoDirectory, 'metadata.json');

  writeJson(metadataPath, {
    ...video,
    url,
    status: 'running',
    model: WHISPER_MODEL,
    startedAt: new Date().toISOString(),
  });

  if (isComplete(videoDirectory)) {
    writeCleanedTranscript(videoDirectory);
    writeJson(metadataPath, {
      ...video,
      url,
      status: 'complete',
      model: WHISPER_MODEL,
      resumedFromExistingOutput: true,
      completedAt: new Date().toISOString(),
    });
    await uploadTranscript(context, video, videoDirectory);
    console.info(`[W${workerId}] SKIP complete ${video.videoId} ${video.title}`);
    return;
  }

  let audioPath = findAudioFile(videoDirectory);
  if (!audioPath) {
    console.info(`[W${workerId}] DOWNLOAD ${video.videoId} ${video.title}`);
    await runProcess(YT_DLP_BIN, [
      '--no-playlist',
      '--no-progress',
      '--no-overwrites',
      '-f', 'ba/b',
      '-x',
      '--audio-format', 'm4a',
      '--audio-quality', '5',
      '-o', path.join(videoDirectory, 'audio.%(ext)s'),
      url,
    ], 30 * 60_000);
    audioPath = findAudioFile(videoDirectory);
    if (!audioPath) throw new Error('download completed but no audio file was found');
  }

  const wavPath = path.join(videoDirectory, 'audio16k.wav');
  if (!fs.existsSync(wavPath)) {
    console.info(`[W${workerId}] CONVERT ${video.videoId}`);
    await runProcess(FFMPEG_BIN, [
      '-y', '-hide_banner', '-loglevel', 'error', '-i', audioPath,
      '-vn', '-ac', '1', '-ar', '16000', wavPath,
    ], 30 * 60_000);
  }

  console.info(`[W${workerId}] TRANSCRIBE ${video.videoId} (${Math.round(video.durationSeconds / 60)} min)`);
  const prompt = [
    '\u65e5\u672c\u8a9e\u306eYouTube\u52d5\u753b\u306e\u6b63\u78ba\u306a\u6587\u5b57\u8d77\u3053\u3057\u3002',
    '\u56fa\u6709\u8a9e: Threads\uff08\u30b9\u30ec\u30c3\u30ba\uff09\u3001Instagram\uff08\u30a4\u30f3\u30b9\u30bf\uff09\u3001Claude Code\u3001ChatGPT\u3001note\u3001\u697d\u5929\u30a2\u30d5\u30a3\u30ea\u30a8\u30a4\u30c8\u3002',
    `\u30c1\u30e3\u30f3\u30cd\u30eb: ${video.channelTitle}\u3002`,
    `\u52d5\u753b\u30bf\u30a4\u30c8\u30eb: ${video.title}\u3002`,
  ].join(' ');
  await runProcess(MLX_WHISPER_BIN, [
    wavPath,
    '--model', WHISPER_MODEL,
    '--language', 'ja',
    '--word-timestamps', 'True',
    '--initial-prompt', prompt,
    '--output-format', 'all',
    '--output-dir', videoDirectory,
    '--output-name', 'transcript',
    '--verbose', 'False',
  ], 3 * 60 * 60_000);

  if (!isComplete(videoDirectory)) throw new Error('Whisper exited successfully but transcript files are incomplete');
  writeCleanedTranscript(videoDirectory);
  writeJson(metadataPath, {
    ...video,
    url,
    status: 'complete',
    model: WHISPER_MODEL,
    completedAt: new Date().toISOString(),
  });
  await uploadTranscript(context, video, videoDirectory);
  console.info(`[W${workerId}] COMPLETE ${video.videoId}`);
}

async function main(): Promise<void> {
  const concurrency = parseIntegerFlag('--concurrency', DEFAULT_CONCURRENCY);
  const limit = parseIntegerFlag('--limit', Number.MAX_SAFE_INTEGER);
  const dryRun = process.argv.includes('--dry-run');
  const projectId = resolveProjectId();
  const context = createYoutubeBigQueryContext(projectId, DATASET_ID);
  await ensureYoutubeTables(context);
  const { targets: allTargets, excluded } = await loadTargetVideos();
  const targets = allTargets.slice(0, limit);
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

  const statuses = new Map<string, VideoStatus>();
  for (const video of allTargets) {
    const videoDirectory = path.join(OUTPUT_ROOT, video.videoId);
    statuses.set(video.videoId, {
      ...video,
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
      status: isComplete(videoDirectory) ? 'complete' : 'pending',
      outputDirectory: videoDirectory,
      updatedAt: new Date().toISOString(),
    });
  }
  for (const video of excluded) {
    statuses.set(video.videoId, {
      ...video,
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
      status: 'excluded',
      error: EXCLUDED_VIDEO_IDS.get(video.videoId),
      updatedAt: new Date().toISOString(),
    });
  }

  const indexPath = path.join(OUTPUT_ROOT, 'index.json');
  const persistIndex = () => writeJson(indexPath, {
    generatedAt: new Date().toISOString(),
    model: WHISPER_MODEL,
    concurrency,
    targetCount: allTargets.length,
    excludedCount: excluded.length,
    totalDurationSeconds: allTargets.reduce((sum, video) => sum + video.durationSeconds, 0),
    videos: Array.from(statuses.values()),
  });
  persistIndex();

  console.info(
    `[youtube-transcript] ${allTargets.length} targets, ${excluded.length} excluded, `
      + `${(allTargets.reduce((sum, video) => sum + video.durationSeconds, 0) / 3600).toFixed(2)} hours`,
  );
  if (dryRun) {
    console.info(`[youtube-transcript] Dry run complete. Index: ${indexPath}`);
    return;
  }

  const queue = [...targets];
  let completeCount = allTargets.filter((video) => isComplete(path.join(OUTPUT_ROOT, video.videoId))).length;
  let failedCount = 0;

  async function worker(workerId: number): Promise<void> {
    while (queue.length > 0) {
      const video = queue.shift();
      if (!video) return;
      const status = statuses.get(video.videoId);
      if (status) {
        status.status = 'running';
        status.updatedAt = new Date().toISOString();
        persistIndex();
      }
      try {
        const wasComplete = isComplete(path.join(OUTPUT_ROOT, video.videoId));
        await transcribeVideo(context, video, workerId);
        if (!wasComplete) completeCount += 1;
        if (status) {
          status.status = 'complete';
          status.error = undefined;
          status.updatedAt = new Date().toISOString();
        }
      } catch (error) {
        failedCount += 1;
        const message = error instanceof Error ? error.message : String(error);
        if (status) {
          status.status = 'failed';
          status.error = message;
          status.updatedAt = new Date().toISOString();
        }
        console.error(`[W${workerId}] FAILED ${video.videoId}: ${message}`);
      }
      persistIndex();
      console.info(`[youtube-transcript] progress ${completeCount}/${allTargets.length}, failed ${failedCount}`);
    }
  }

  const workerCount = Math.min(concurrency, Math.max(targets.length, 1));
  await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(index + 1)));
  console.info(`[youtube-transcript] Done. ${completeCount} complete, ${failedCount} failed.`);
  if (failedCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[youtube-transcript] Fatal:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
