import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const PROJECT_ID = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID);
const ADS_DATASET = process.env.META_ADS_DATASET ?? 'autostudio_ads';
const LOCATION = process.env.META_ADS_LOCATION ?? 'asia-northeast1';

const WHISPER_CLI = process.env.WHISPER_CLI ?? '/opt/homebrew/bin/whisper-cli';
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? '/Users/kudo/whisper-models/ggml-medium.bin';
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? '/opt/homebrew/bin/ffmpeg';
const SCRAPE_UA = 'Twitterbot/1.0';

interface AdCreativeRow {
  ad_id: string;
  ad_name: string | null;
  instagram_permalink_url: string;
  video_id: string | null;
}

interface TranscriptSegment { start: number; end: number; text: string; }
interface WhisperJsonOutput { transcription?: Array<{ offsets?: { from?: number; to?: number }; text?: string }>; }

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'");
}

async function fetchVideoUrl(permalink: string): Promise<string | null> {
  try {
    const response = await fetch(permalink, { headers: { 'User-Agent': SCRAPE_UA } });
    if (!response.ok) return null;
    const html = await response.text();
    const match = html.match(/og:video"\s+content="([^"]+)"/);
    if (!match) return null;
    return decodeHtmlEntities(match[1]);
  } catch {
    return null;
  }
}

function runProc(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('timeout')); }, timeoutMs);
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error(`exit ${code}: ${stderr.slice(0, 300)}`)); return; }
      resolve(stdout);
    });
  });
}

async function transcribeVideoUrl(videoUrl: string): Promise<{ segments: TranscriptSegment[]; rawText: string } | null> {
  const tempBase = path.join(os.tmpdir(), `adreel-${crypto.randomUUID()}`);
  const videoPath = `${tempBase}.mp4`;
  const wavPath = `${tempBase}.wav`;
  const jsonPath = `${tempBase}.json`;
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(videoPath, buffer);
    await runProc(FFMPEG_BIN, ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', wavPath], 60_000);
    await runProc(WHISPER_CLI, ['-m', WHISPER_MODEL, '-f', wavPath, '-l', 'ja', '-oj', '-of', tempBase, '-t', '4'], 600_000);
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(raw) as WhisperJsonOutput;
    const segments = (data.transcription ?? []).map((item) => ({
      start: Number(item.offsets?.from ?? 0) / 1000,
      end: Number(item.offsets?.to ?? 0) / 1000,
      text: String(item.text ?? '').trim(),
    })).filter((s) => s.text);
    return { segments, rawText: segments.map((s) => s.text).join(' ') };
  } finally {
    fs.promises.unlink(videoPath).catch(() => {});
    fs.promises.unlink(wavPath).catch(() => {});
    fs.promises.unlink(jsonPath).catch(() => {});
  }
}

async function ensureTable(bq: ReturnType<typeof createBigQueryClient>): Promise<void> {
  const table = bq.dataset(ADS_DATASET).table('meta_ad_reel_transcripts');
  const [exists] = await table.exists();
  if (exists) return;
  await table.create({
    schema: [
      { name: 'instagram_permalink_url', type: 'STRING', mode: 'REQUIRED' },
      { name: 'ad_name', type: 'STRING' },
      { name: 'video_url', type: 'STRING' },
      { name: 'duration_seconds', type: 'FLOAT64' },
      { name: 'segments_json', type: 'STRING' },
      { name: 'raw_text', type: 'STRING' },
      { name: 'model_name', type: 'STRING' },
      { name: 'transcribed_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    ],
    clustering: { fields: ['instagram_permalink_url'] },
  });
  console.log('Created meta_ad_reel_transcripts');
}

async function main() {
  const bq = createBigQueryClient(PROJECT_ID, LOCATION);
  await ensureTable(bq);

  const [rows] = await bq.query({
    query: `
      WITH latest AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY ad_id ORDER BY synced_at DESC) AS rn
        FROM \`${PROJECT_ID}.${ADS_DATASET}.meta_ad_creatives\`
      ),
      done AS (
        SELECT DISTINCT instagram_permalink_url FROM \`${PROJECT_ID}.${ADS_DATASET}.meta_ad_reel_transcripts\`
      )
      SELECT DISTINCT l.ad_id, l.ad_name, l.instagram_permalink_url, l.video_id
      FROM latest l
      LEFT JOIN done d ON l.instagram_permalink_url = d.instagram_permalink_url
      WHERE l.rn = 1
        AND l.instagram_permalink_url IS NOT NULL
        AND l.instagram_permalink_url LIKE '%instagram.com/%'
        AND l.video_id IS NOT NULL
        AND d.instagram_permalink_url IS NULL
    `,
  });

  const creatives = rows as AdCreativeRow[];
  console.log(`[ad-reel-transcribe] ${creatives.length} ad creatives need transcription`);

  for (const c of creatives) {
    console.log(`[ad-reel-transcribe] ${c.ad_name} (${c.instagram_permalink_url})`);
    const videoUrl = await fetchVideoUrl(c.instagram_permalink_url);
    if (!videoUrl) { console.warn('  → og:video not found, skip'); continue; }
    try {
      const result = await transcribeVideoUrl(videoUrl);
      if (!result || !result.segments.length) { console.warn('  → no segments'); continue; }
      await bq.dataset(ADS_DATASET).table('meta_ad_reel_transcripts').insert([{
        instagram_permalink_url: c.instagram_permalink_url,
        ad_name: c.ad_name,
        video_url: videoUrl,
        duration_seconds: result.segments.length ? result.segments[result.segments.length - 1].end : null,
        segments_json: JSON.stringify(result.segments),
        raw_text: result.rawText,
        model_name: `whisper-cpp:${path.basename(WHISPER_MODEL)}`,
        transcribed_at: new Date().toISOString(),
      }]);
      console.log(`  OK: ${result.segments.length} segments`);
    } catch (error) {
      console.warn(`  FAIL:`, (error as Error).message);
    }
  }
  console.log('[ad-reel-transcribe] Done.');
}

main().catch((err) => { console.error('Fatal:', err); process.exitCode = 1; });
