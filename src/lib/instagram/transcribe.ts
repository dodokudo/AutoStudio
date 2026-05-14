import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const WHISPER_CLI = process.env.WHISPER_CLI ?? '/opt/homebrew/bin/whisper-cli';
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? '/Users/kudo/whisper-models/ggml-medium.bin';
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? '/opt/homebrew/bin/ffmpeg';
const WHISPER_LANG = process.env.WHISPER_LANG ?? 'ja';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscribeResult {
  segments: TranscriptSegment[];
  rawText: string;
  modelName: string;
}

async function downloadToTemp(mediaUrl: string): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `ig-reel-${crypto.randomUUID()}.mp4`);
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${mediaUrl}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.promises.writeFile(tempPath, buffer);
  return tempPath;
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

async function extractAudio(videoPath: string): Promise<string> {
  const wavPath = videoPath.replace(/\.mp4$/, '') + '.wav';
  await runProc(FFMPEG_BIN, [
    '-y', '-i', videoPath,
    '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav',
    wavPath,
  ], 60_000);
  return wavPath;
}

interface WhisperJsonSegment {
  offsets?: { from?: number; to?: number };
  text?: string;
}

interface WhisperJsonOutput {
  transcription?: WhisperJsonSegment[];
}

function parseWhisperJson(jsonPath: string): TranscriptSegment[] {
  try {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(raw) as WhisperJsonOutput;
    if (!Array.isArray(data.transcription)) return [];
    return data.transcription
      .map((item) => {
        const fromMs = Number(item.offsets?.from ?? 0);
        const toMs = Number(item.offsets?.to ?? 0);
        return {
          start: fromMs / 1000,
          end: toMs / 1000,
          text: String(item.text ?? '').trim(),
        };
      })
      .filter((seg) => seg.text.length > 0);
  } catch {
    return [];
  }
}

export async function transcribeVideoFromUrl(mediaUrl: string): Promise<TranscribeResult> {
  if (!fs.existsSync(WHISPER_MODEL)) {
    throw new Error(`Whisper model not found at ${WHISPER_MODEL}. Run: brew install whisper-cpp && download ggml model.`);
  }
  if (!fs.existsSync(WHISPER_CLI)) {
    throw new Error(`whisper-cli not found at ${WHISPER_CLI}`);
  }

  const videoPath = await downloadToTemp(mediaUrl);
  let wavPath: string | null = null;
  let jsonPath: string | null = null;
  try {
    wavPath = await extractAudio(videoPath);
    const outputBase = wavPath.replace(/\.wav$/, '');
    jsonPath = `${outputBase}.json`;
    await runProc(WHISPER_CLI, [
      '-m', WHISPER_MODEL,
      '-f', wavPath,
      '-l', WHISPER_LANG,
      '-oj',
      '-of', outputBase,
      '-t', '4',
    ], 600_000);

    const segments = parseWhisperJson(jsonPath);
    const rawText = segments.map((s) => s.text).join(' ');
    return {
      segments,
      rawText,
      modelName: `whisper-cpp:${path.basename(WHISPER_MODEL)}`,
    };
  } finally {
    if (wavPath) fs.promises.unlink(wavPath).catch(() => {});
    if (jsonPath) fs.promises.unlink(jsonPath).catch(() => {});
    fs.promises.unlink(videoPath).catch(() => {});
  }
}

export function findDropoffSegment(segments: TranscriptSegment[], avgWatchSeconds: number): TranscriptSegment | null {
  if (!segments.length || !Number.isFinite(avgWatchSeconds) || avgWatchSeconds <= 0) return null;
  const within = segments.filter((seg) => seg.start <= avgWatchSeconds);
  if (!within.length) return segments[0];
  return within[within.length - 1];
}
