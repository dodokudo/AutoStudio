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

interface GeminiTranscriptPayload {
  segments?: Array<{
    start?: number;
    end?: number;
    text?: string;
  }>;
  rawText?: string;
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

async function transcribeWithGemini(mediaUrl: string, apiKey: string): Promise<TranscribeResult> {
  const videoPath = await downloadToTemp(mediaUrl);
  let fileUri: string | null = null;
  try {
    const buffer = await fs.promises.readFile(videoPath);
    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
    const { body, contentType } = createMultipart(buffer, `ig-reel-${crypto.randomUUID()}.mp4`);
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'X-Goog-Upload-Protocol': 'multipart',
      },
      body: body as unknown as BodyInit,
    });

    if (!uploadResponse.ok) {
      const text = await uploadResponse.text();
      throw new Error(`Gemini upload failed (${uploadResponse.status}): ${text}`);
    }

    const uploadResult = await uploadResponse.json();
    fileUri = uploadResult?.file?.uri || uploadResult?.file?.name || null;
    if (!fileUri) {
      throw new Error(`Gemini upload did not return file uri: ${JSON.stringify(uploadResult)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const generateResponse = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { fileData: { mimeType: 'video/mp4', fileUri } },
              { text: buildGeminiTranscriptPrompt() },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
        },
      }),
    });

    if (!generateResponse.ok) {
      const text = await generateResponse.text();
      throw new Error(`Gemini generate error (${generateResponse.status}): ${text}`);
    }

    const result = await generateResponse.json();
    const rawJson: string | undefined = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      throw new Error(`Gemini did not return transcript text: ${JSON.stringify(result).slice(0, 500)}`);
    }

    const payload = JSON.parse(rawJson) as GeminiTranscriptPayload;
    const segments = normalizeGeminiSegments(payload);
    const rawText = payload.rawText?.trim() || segments.map((segment) => segment.text).join(' ');
    return {
      segments,
      rawText,
      modelName: 'gemini-2.5-flash',
    };
  } finally {
    if (fileUri) {
      deleteGeminiFile(fileUri, apiKey).catch(() => {});
    }
    fs.promises.unlink(videoPath).catch(() => {});
  }
}

function createMultipart(buffer: Buffer, filename: string): { body: Buffer; contentType: string } {
  const boundary = `----AutoStudioGeminiBoundary${crypto.randomUUID().replaceAll('-', '')}`;
  const crlf = '\r\n';
  const metadata = JSON.stringify({ file: { displayName: filename } });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}${crlf}Content-Type: application/json; charset=UTF-8${crlf}${crlf}${metadata}${crlf}`),
    Buffer.from(`--${boundary}${crlf}Content-Type: video/mp4${crlf}${crlf}`),
    buffer,
    Buffer.from(`${crlf}--${boundary}--${crlf}`),
  ]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

function buildGeminiTranscriptPrompt(): string {
  return [
    'このInstagramリール動画の日本語音声を文字起こししてください。',
    '返答は必ずJSONのみです。',
    'segmentsは、意味の区切りごとに開始秒・終了秒・本文を入れてください。',
    '秒数は動画上の概算で構いませんが、離脱位置分析に使うため時系列順にしてください。',
    '{',
    '  "rawText": "全文の文字起こし",',
    '  "segments": [',
    '    { "start": 0, "end": 3.2, "text": "発話内容" }',
    '  ]',
    '}',
  ].join('\n');
}

function normalizeGeminiSegments(payload: GeminiTranscriptPayload): TranscriptSegment[] {
  const source = Array.isArray(payload.segments) ? payload.segments : [];
  const segments = source
    .map((segment, index) => {
      const start = Number(segment.start ?? index * 5);
      const end = Number(segment.end ?? start + 5);
      return {
        start: Number.isFinite(start) && start >= 0 ? start : index * 5,
        end: Number.isFinite(end) && end > start ? end : start + 5,
        text: String(segment.text ?? '').trim(),
      };
    })
    .filter((segment) => segment.text.length > 0);

  if (segments.length) return segments;
  const rawText = payload.rawText?.trim();
  return rawText ? [{ start: 0, end: 0, text: rawText }] : [];
}

async function deleteGeminiFile(fileUri: string, apiKey: string): Promise<void> {
  const fileId = fileUri.split('/').pop();
  if (!fileId) return;
  await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${fileId}`, {
    method: 'DELETE',
    headers: { 'x-goog-api-key': apiKey },
  });
}

export async function transcribeVideoFromUrl(mediaUrl: string): Promise<TranscribeResult> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) {
    return transcribeWithGemini(mediaUrl, geminiApiKey);
  }

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
