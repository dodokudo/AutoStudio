import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { YoutubeTranscriptChapter, YoutubeTranscriptSegment } from '@/lib/youtube/transcripts';

const OUTPUT_ROOT = path.resolve(
  process.env.YOUTUBE_TRANSCRIPT_OUTPUT_DIR ?? 'output/youtube-transcripts/threads',
);
const SCHEMA_PATH = path.resolve('src/scripts/youtubeTranscriptChapters.schema.json');
const WINDOW_SECONDS = 60;
const MAX_WINDOW_TEXT_LENGTH = 420;

interface IndexVideo {
  videoId: string;
  title: string;
  durationSeconds: number;
  status: string;
}

interface ChapterResponse {
  videos: Array<{
    videoId: string;
    chapters: Array<{ start: number; title: string }>;
  }>;
}

function parseIntegerFlag(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const raw = index >= 0 ? process.argv[index + 1] : undefined;
  const value = Number(raw ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function formatTimestamp(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
}

function readSegments(videoId: string): YoutubeTranscriptSegment[] {
  const transcriptPath = path.join(OUTPUT_ROOT, videoId, 'transcript.json');
  const parsed = JSON.parse(fs.readFileSync(transcriptPath, 'utf8')) as {
    segments?: Array<Record<string, unknown>>;
  };
  return (parsed.segments ?? [])
    .map((segment) => ({
      start: Number(segment.start ?? 0),
      end: Number(segment.end ?? 0),
      text: String(segment.text ?? '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((segment) => segment.text.length > 0);
}

function buildTimeline(segments: YoutubeTranscriptSegment[], durationSeconds: number): string {
  const rows: string[] = [];
  for (let start = 0; start < durationSeconds; start += WINDOW_SECONDS) {
    const end = Math.min(start + WINDOW_SECONDS, durationSeconds);
    const text = segments
      .filter((segment) => segment.end > start && segment.start < end)
      .map((segment) => segment.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    rows.push(`[${formatTimestamp(start)}-${formatTimestamp(end)}] ${text.slice(0, MAX_WINDOW_TEXT_LENGTH)}`);
  }
  return rows.join('\n');
}

function runCodex(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', [
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--sandbox', 'read-only',
      '--model', 'gpt-5.5',
      '--config', 'model_reasoning_effort="low"',
      '--output-schema', SCHEMA_PATH,
      '--color', 'never',
      '-',
    ], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Codex chapter generation timed out after 15 minutes'));
    }, 15 * 60_000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk.toString()}`.slice(-8_000); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`codex exited with ${code}: ${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin.end(prompt);
  });
}

function normalizeChapters(
  raw: Array<{ start: number; title: string }>,
  durationSeconds: number,
): YoutubeTranscriptChapter[] {
  const starts = raw
    .map((chapter) => ({
      start: Math.max(0, Math.min(Math.floor(Number(chapter.start)), durationSeconds - 1)),
      title: String(chapter.title).replace(/^[0-9\uff10-\uff19]+[.\u3001:\uff1a\s-]*/, '').trim().slice(0, 40),
    }))
    .filter((chapter) => chapter.title.length >= 2 && Number.isFinite(chapter.start))
    .sort((a, b) => a.start - b.start)
    .filter((chapter, index, chapters) => index === 0 || chapter.start - chapters[index - 1].start >= 60);
  if (!starts.length || starts[0].start > 30) starts.unshift({ start: 0, title: '\u30aa\u30fc\u30d7\u30cb\u30f3\u30b0' });
  else starts[0].start = 0;
  return starts.map((chapter, index) => ({
    start: chapter.start,
    end: starts[index + 1]?.start ?? durationSeconds,
    title: chapter.title,
  }));
}

function buildPrompt(videos: IndexVideo[]): string {
  const materials = videos.map((video) => {
    const segments = readSegments(video.videoId);
    return [
      `VIDEO_ID: ${video.videoId}`,
      `TITLE: ${video.title}`,
      `DURATION_SECONDS: ${video.durationSeconds}`,
      'TRANSCRIPT_TIMELINE:',
      buildTimeline(segments, video.durationSeconds),
    ].join('\n');
  }).join('\n\n===== NEXT VIDEO =====\n\n');

  return `\u3042\u306a\u305f\u306fYouTube\u9577\u5c3a\u52d5\u753b\u306e\u69cb\u6210\u7de8\u96c6\u8005\u3067\u3059\u3002\u4e0b\u8a18\u306e\u6587\u5b57\u8d77\u3053\u3057\u30bf\u30a4\u30e0\u30e9\u30a4\u30f3\u3060\u3051\u3092\u6839\u62e0\u306b\u3001\u52d5\u753b\u3054\u3068\u306e\u76ee\u6b21\u3092\u4f5c\u3063\u3066\u304f\u3060\u3055\u3044\u3002

\u8981\u4ef6:
- YouTube\u306e\u65e2\u5b58\u30c1\u30e3\u30d7\u30bf\u30fc\u3084\u5916\u90e8\u60c5\u5831\u306f\u4f7f\u308f\u306a\u3044\u3002
- \u8a71\u984c\u304c\u5207\u308a\u66ff\u308f\u308b\u5b9f\u969b\u306e\u6642\u523b\u3092start\u306b\u3059\u308b\u3002\u5165\u529b\u306e\u30bf\u30a4\u30e0\u30e9\u30a4\u30f3\u306b\u3042\u308b\u79d2\u6570\u3092\u4f7f\u3046\u3002
- \u6700\u521d\u306e\u7ae0\u306fstart=0\u3002\u52d5\u753b\u5168\u4f53\u3092\u6700\u5f8c\u307e\u3067\u8986\u3046\u3002
- 15\u301c30\u5206\u306f5\u301c8\u7ae0\u300130\u301c60\u5206\u306f7\u301c12\u7ae0\u300160\u5206\u4ee5\u4e0a\u306f10\u301c16\u7ae0\u3092\u76ee\u5b89\u306b\u3059\u308b\u3002\u610f\u5473\u306e\u306a\u30445\u5206\u523b\u307f\u306b\u3057\u306a\u3044\u3002
- \u30aa\u30fc\u30d7\u30cb\u30f3\u30b0\u3001\u81ea\u5df1\u7d39\u4ecb\u3001\u5168\u4f53\u50cf\u3001\u5404\u30ce\u30a6\u30cf\u30a6\u3001\u5b9f\u6f14\u3001\u307e\u3068\u3081\u7b49\u3092\u3001\u5b9f\u969b\u306e\u5185\u5bb9\u306b\u5408\u308f\u305b\u3066\u5206\u3051\u308b\u3002
- \u7ae0\u30bf\u30a4\u30c8\u30eb\u306f\u300c\u7b2c1\u7ae0\u300d\u306e\u3088\u3046\u306a\u62bd\u8c61\u540d\u3067\u306f\u306a\u304f\u3001\u300c\u30b8\u30e3\u30f3\u30eb\u9078\u5b9a\u300d\u300c\u4f38\u3073\u308b\u6295\u7a3f\u306e3\u3064\u306e\u578b\u300d\u306e\u3088\u3046\u306b\u3001\u305d\u3053\u3067\u4f55\u3092\u8a71\u3059\u304b\u304c\u308f\u304b\u308b\u65e5\u672c\u8a9e\u306b\u3059\u308b\u3002
- \u30bf\u30a4\u30c8\u30eb\u306f40\u6587\u5b57\u4ee5\u5185\u3002
- \u5404VIDEO_ID\u30921\u56de\u305a\u3064\u8fd4\u3059\u3002

${materials}`;
}

async function main(): Promise<void> {
  const batchSize = parseIntegerFlag('--batch-size', 3);
  const limit = parseIntegerFlag('--limit', Number.MAX_SAFE_INTEGER);
  const force = process.argv.includes('--force');
  const index = JSON.parse(fs.readFileSync(path.join(OUTPUT_ROOT, 'index.json'), 'utf8')) as {
    videos: IndexVideo[];
  };
  const videos = index.videos
    .filter((video) => video.status !== 'excluded')
    .filter((video) => fs.existsSync(path.join(OUTPUT_ROOT, video.videoId, 'transcript.json')))
    .filter((video) => force || !fs.existsSync(path.join(OUTPUT_ROOT, video.videoId, 'chapters.json')))
    .slice(0, limit);
  console.info(`[youtube-chapters] ${videos.length} videos to analyze`);

  let completed = 0;
  let failed = 0;
  for (let offset = 0; offset < videos.length; offset += batchSize) {
    const batch = videos.slice(offset, offset + batchSize);
    console.info(`[youtube-chapters] ANALYZE ${batch.map((video) => video.videoId).join(', ')}`);
    try {
      const response = JSON.parse(await runCodex(buildPrompt(batch))) as ChapterResponse;
      for (const video of batch) {
        const generated = response.videos.find((item) => item.videoId === video.videoId);
        if (!generated) throw new Error(`response missing ${video.videoId}`);
        const chapters = normalizeChapters(generated.chapters, video.durationSeconds);
        if (chapters.length < 3) throw new Error(`too few chapters for ${video.videoId}`);
        fs.writeFileSync(
          path.join(OUTPUT_ROOT, video.videoId, 'chapters.json'),
          `${JSON.stringify({
            source: 'auto',
            method: 'codex-transcript-analysis',
            chapters,
            generatedAt: new Date().toISOString(),
          }, null, 2)}\n`,
          'utf8',
        );
        completed += 1;
      }
    } catch (error) {
      failed += batch.length;
      console.error(`[youtube-chapters] FAILED ${batch.map((video) => video.videoId).join(', ')}: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.info(`[youtube-chapters] progress ${completed}/${videos.length}, failed ${failed}`);
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[youtube-chapters] Fatal:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
