import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY ?? '';
}
function getTranscribeModel(): string {
  return process.env.IG_TRANSCRIBE_MODEL ?? 'gemini-2.5-flash';
}

const PROMPT = `この動画の音声を秒単位のタイムスタンプ付きで文字起こししてください。
JSON配列のみで返してください。各要素は {"start": 開始秒, "end": 終了秒, "text": "発話内容"} の形式です。
背景音楽だけのセクションは含めないでください。`;

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

function safeParseSegments(text: string): TranscriptSegment[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    return parsed
      .filter((item) => typeof item.start === 'number' && typeof item.text === 'string')
      .map((item) => ({
        start: Number(item.start),
        end: typeof item.end === 'number' ? Number(item.end) : Number(item.start),
        text: String(item.text).trim(),
      }));
  } catch {
    return [];
  }
}

export async function transcribeVideoFromUrl(mediaUrl: string): Promise<TranscribeResult> {
  const apiKey = getGeminiApiKey();
  const modelName = getTranscribeModel();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  const tempPath = await downloadToTemp(mediaUrl);
  try {
    const fileManager = new GoogleAIFileManager(apiKey);
    const uploaded = await fileManager.uploadFile(tempPath, { mimeType: 'video/mp4' });

    let fileMeta = await fileManager.getFile(uploaded.file.name);
    let attempts = 0;
    while (fileMeta.state === FileState.PROCESSING && attempts < 60) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      fileMeta = await fileManager.getFile(uploaded.file.name);
      attempts += 1;
    }
    if (fileMeta.state !== FileState.ACTIVE) {
      throw new Error(`Gemini file did not become active: ${fileMeta.state}`);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent([
      { fileData: { mimeType: 'video/mp4', fileUri: fileMeta.uri } },
      { text: PROMPT },
    ]);
    const rawText = result.response.text();
    const segments = safeParseSegments(rawText);

    try {
      await fileManager.deleteFile(fileMeta.name);
    } catch {
      // ignore cleanup failure
    }

    return { segments, rawText, modelName };
  } finally {
    fs.promises.unlink(tempPath).catch(() => {});
  }
}

export function findDropoffSegment(segments: TranscriptSegment[], avgWatchSeconds: number): TranscriptSegment | null {
  if (!segments.length || !Number.isFinite(avgWatchSeconds) || avgWatchSeconds <= 0) return null;
  const within = segments.filter((seg) => seg.start <= avgWatchSeconds);
  if (!within.length) return segments[0];
  return within[within.length - 1];
}
