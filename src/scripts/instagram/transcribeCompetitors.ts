import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { google } from 'googleapis';
import { createInstagramBigQuery, ensureInstagramTables, getInstagramStorageConfig } from '@/lib/instagram/bigquery';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const TARGET_USERNAMES = [
  'mon_guchi',
  'sugisan_insta_',
  'yuri_insta_oni',
  'hika_marke_',
  'sakisns_ad',
  'sns_freelance_aya',
  'takumu_sns',
  'freelance__barachan',
];
const PER_ACCOUNT_LIMIT = Number(process.env.IG_COMP_TRANSCRIBE_PER_ACCOUNT ?? '10');
const CONCURRENCY = Number(process.env.IG_COMP_TRANSCRIBE_CONCURRENCY ?? '10');

const WHISPER_CLI = process.env.WHISPER_CLI ?? '/opt/homebrew/bin/whisper-cli';
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? '/Users/kudo/whisper-models/ggml-medium.bin';
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? '/opt/homebrew/bin/ffmpeg';
const WHISPER_LANG = process.env.WHISPER_LANG ?? 'ja';

interface CompetitorReel {
  username: string;
  instagram_media_id: string;
  drive_file_id: string;
  caption: string | null;
  posted_at: string;
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperJsonSegment {
  offsets?: { from?: number; to?: number };
  text?: string;
}

interface WhisperJsonOutput {
  transcription?: WhisperJsonSegment[];
}

function runProc(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Process timed out: ${command}`));
    }, timeoutMs);
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${command} exited with ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve(stdout);
    });
  });
}

async function downloadDriveFile(fileId: string, destPath: string): Promise<void> {
  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );
  await new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    response.data.on('end', () => resolve());
    response.data.on('error', (err: Error) => reject(err));
    response.data.pipe(writer);
  });
}

function parseWhisperJson(jsonPath: string): TranscriptSegment[] {
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(raw) as WhisperJsonOutput;
    if (!Array.isArray(data.transcription)) return [];
    return data.transcription
      .map((item) => ({
        start: Number(item.offsets?.from ?? 0) / 1000,
        end: Number(item.offsets?.to ?? 0) / 1000,
        text: String(item.text ?? '').trim(),
      }))
      .filter((seg) => seg.text.length > 0);
  } catch {
    return [];
  }
}

async function transcribeReel(reel: CompetitorReel): Promise<{ segments: TranscriptSegment[]; rawText: string } | null> {
  const tempBase = path.join(os.tmpdir(), `comp-${crypto.randomUUID()}`);
  const videoPath = `${tempBase}.mp4`;
  const wavPath = `${tempBase}.wav`;
  const jsonPath = `${tempBase}.json`;
  try {
    await downloadDriveFile(reel.drive_file_id, videoPath);
    await runProc(FFMPEG_BIN, [
      '-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', wavPath,
    ], 90_000);
    await runProc(WHISPER_CLI, [
      '-m', WHISPER_MODEL, '-f', wavPath, '-l', WHISPER_LANG, '-oj', '-of', tempBase, '-t', '2',
    ], 600_000);
    const segments = parseWhisperJson(jsonPath);
    const rawText = segments.map((s) => s.text).join(' ');
    return { segments, rawText };
  } finally {
    fs.promises.unlink(videoPath).catch(() => {});
    fs.promises.unlink(wavPath).catch(() => {});
    fs.promises.unlink(jsonPath).catch(() => {});
  }
}

async function main() {
  const bigquery = createInstagramBigQuery();
  await ensureInstagramTables(bigquery);
  const { projectId, dataset } = getInstagramStorageConfig();

  const [reelRows] = await bigquery.query({
    query: `
      WITH unique_reels AS (
        SELECT
          username,
          instagram_media_id,
          ANY_VALUE(drive_file_id) AS drive_file_id,
          ANY_VALUE(caption) AS caption,
          MAX(posted_at) AS posted_at
        FROM \`${projectId}.${dataset}.competitor_reels_raw\`
        WHERE username IN UNNEST(@usernames)
          AND drive_file_id IS NOT NULL
        GROUP BY username, instagram_media_id
      ),
      ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY username ORDER BY posted_at DESC) AS rn
        FROM unique_reels
      )
      SELECT username, instagram_media_id, drive_file_id, caption, posted_at
      FROM ranked
      WHERE rn <= @limit
    `,
    params: { usernames: TARGET_USERNAMES, limit: PER_ACCOUNT_LIMIT },
  });

  const reels = reelRows as CompetitorReel[];
  console.log(`[transcribe-competitors] Loaded ${reels.length} reels from ${TARGET_USERNAMES.length} accounts.`);

  // 既に文字起こし済みのものを除外
  const [existingRows] = await bigquery.query({
    query: `SELECT DISTINCT instagram_media_id FROM \`${projectId}.${dataset}.competitor_reels_transcripts\``,
  });
  const done = new Set((existingRows as Array<{ instagram_media_id: string }>).map((r) => r.instagram_media_id));
  const targets = reels.filter((r) => !done.has(r.instagram_media_id));
  console.log(`[transcribe-competitors] ${targets.length} new reels to transcribe (${reels.length - targets.length} already done).`);

  if (!targets.length) {
    console.log('[transcribe-competitors] Nothing to do.');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  let processedCount = 0;

  async function worker(workerIdx: number, queue: CompetitorReel[]) {
    while (queue.length > 0) {
      const reel = queue.shift();
      if (!reel) return;
      processedCount += 1;
      const tag = `[W${workerIdx} ${processedCount}/${targets.length}]`;
      try {
        const result = await transcribeReel(reel);
        if (!result || result.segments.length === 0) {
          console.warn(`${tag} ${reel.username}/${reel.instagram_media_id}: no segments`);
          failCount += 1;
          continue;
        }
        const postedAt = typeof reel.posted_at === 'object' && reel.posted_at && 'value' in (reel.posted_at as object)
          ? (reel.posted_at as { value: string }).value
          : String(reel.posted_at);
        await bigquery.dataset(dataset).table('competitor_reels_transcripts').insert([{
          snapshot_date: new Date().toISOString().slice(0, 10),
          username: reel.username,
          instagram_media_id: reel.instagram_media_id,
          drive_file_id: reel.drive_file_id,
          posted_at: postedAt,
          transcribed_at: new Date().toISOString(),
          model_name: `whisper-cpp:${path.basename(WHISPER_MODEL)}`,
          segments_json: JSON.stringify(result.segments),
          raw_text: result.rawText,
          caption: reel.caption,
          summary: '',
          key_points: [],
          hooks: [],
          cta_ideas: [],
          created_at: new Date().toISOString(),
        }]);
        successCount += 1;
        console.log(`${tag} OK ${reel.username}/${reel.instagram_media_id}: ${result.segments.length}seg`);
      } catch (error) {
        failCount += 1;
        const err = error as Error & { errors?: unknown };
        console.warn(`${tag} FAIL ${reel.username}/${reel.instagram_media_id}:`, err.message || err);
        if (err.errors) {
          console.warn(`${tag} insert errors:`, JSON.stringify(err.errors, null, 2).slice(0, 800));
        }
      }
    }
  }

  const queue = [...targets];
  const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, (_, i) => worker(i + 1, queue));
  await Promise.all(workers);

  console.log(`[transcribe-competitors] Done. ${successCount} OK, ${failCount} FAIL out of ${targets.length}.`);
}

main().catch((error) => {
  console.error('[transcribe-competitors] Fatal:', error);
  process.exitCode = 1;
});
