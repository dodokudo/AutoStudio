#!/usr/bin/env tsx

import { config } from 'dotenv';
config({ path: '.env.local' });
import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import { loadInstagramConfig } from '@/lib/instagram/config';
import { createInstagramBigQuery, ensureInstagramTables } from '@/lib/instagram/bigquery';

interface PendingRow {
  drive_file_id: string;
  instagram_media_id: string;
  snapshot_date: string;
}

async function main(): Promise<void> {
  const config = loadInstagramConfig();
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });
  const bigquery = createInstagramBigQuery();

  await ensureInstagramTables(bigquery);

  const pending = await listPendingTranscripts(bigquery, config);
  if (pending.length === 0) {
    console.log('[instagram/transcribe] No pending videos');
    return;
  }

  for (const row of pending) {
    try {
      console.log(`[instagram/transcribe] Processing ${row.instagram_media_id}`);
      const transcript = await transcribeWithGemini({ row, drive });
      if (!transcript) {
        console.warn(`[instagram/transcribe] Transcript missing for ${row.instagram_media_id}`);
        continue;
      }
      await insertTranscript(bigquery, config, row, transcript);
    } catch (error) {
      console.error(`[instagram/transcribe] Failed for ${row.instagram_media_id}`, error);
    }
  }
}

async function listPendingTranscripts(bigquery: BigQuery, config: ReturnType<typeof loadInstagramConfig>): Promise<PendingRow[]> {
  const query = `
    SELECT
      raw.snapshot_date,
      raw.drive_file_id,
      raw.instagram_media_id
    FROM \
\`${config.projectId}.${config.dataset}.competitor_reels_raw\` AS raw
    LEFT JOIN \
\`${config.projectId}.${config.dataset}.competitor_reels_transcripts\` AS transcripts
      ON raw.instagram_media_id = transcripts.instagram_media_id
    WHERE transcripts.instagram_media_id IS NULL
    ORDER BY raw.snapshot_date DESC
    LIMIT 10
  `;
  const [rows] = await bigquery.query(query, { location: config.location });
  return rows as PendingRow[];
}

interface TranscriptPayload {
  summary: string;
  keyPoints: string[];
  hooks: string[];
  ctaIdeas: string[];
}

async function transcribeWithGemini(params: { row: PendingRow; drive: ReturnType<typeof google.drive> }): Promise<TranscriptPayload | null> {
  const { row, drive } = params;
  const config = loadInstagramConfig();

  const fileResponse = await drive.files.get({
    fileId: row.drive_file_id,
    alt: 'media',
  }, { responseType: 'arraybuffer' });

  const buffer = Buffer.from(fileResponse.data as ArrayBufferLike);
  if (!buffer.length) {
    return null;
  }

  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${config.geminiApiKey}`;
  const { body, contentType } = createMultipart(arrayBuffer, row.instagram_media_id);
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'X-Goog-Upload-Protocol': 'multipart',
    },
    body,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`Gemini upload failed (${uploadResponse.status}): ${text}`);
  }

  const uploadResult = await uploadResponse.json();
  const fileUri: string | undefined = uploadResult?.file?.uri || uploadResult?.file?.name;
  if (!fileUri) {
    throw new Error(`Gemini upload did not return file uri. Response: ${JSON.stringify(uploadResult)}`);
  }

  // Wait for file to be processed
  await new Promise(resolve => setTimeout(resolve, 5000));

  const prompt = buildGeminiPrompt();
  const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.geminiApiKey}`;
  const generateResponse = await fetch(generateUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { fileData: { mimeType: 'video/mp4', fileUri } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!generateResponse.ok) {
    const text = await generateResponse.text();
    throw new Error(`Gemini generate error: ${text}`);
  }

  const result = await generateResponse.json();
  const rawText: string | undefined = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  await deleteGeminiFile(fileUri, config.geminiApiKey);

  if (!rawText) {
    return null;
  }

  let payload: TranscriptPayload;
  try {
    payload = JSON.parse(rawText) as TranscriptPayload;
  } catch (error) {
    console.warn('[instagram/transcribe] Failed to parse JSON, falling back to summary-only mode', error);
    payload = {
      summary: rawText.slice(0, 2000),
      keyPoints: [],
      hooks: [],
      ctaIdeas: [],
    };
  }
  return payload;
}

function createMultipart(buffer: ArrayBuffer, filename: string): { body: Buffer; contentType: string } {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const CRLF = '\r\n';

  const metadata = JSON.stringify({
    file: {
      displayName: filename
    }
  });

  const parts: Buffer[] = [];

  // Metadata part
  parts.push(Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Type: application/json; charset=UTF-8${CRLF}` +
    CRLF +
    metadata +
    CRLF
  ));

  // File data part
  parts.push(Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Type: video/mp4${CRLF}` +
    CRLF
  ));
  parts.push(Buffer.from(buffer));
  parts.push(Buffer.from(CRLF));

  // Closing boundary
  parts.push(Buffer.from(`--${boundary}--${CRLF}`));

  const body = Buffer.concat(parts);
  const contentType = `multipart/related; boundary=${boundary}`;

  return { body, contentType };
}

function buildGeminiPrompt(): string {
  return [
    'あなたはSNS動画の要約アナリストです。',
    '提供する動画の内容を簡潔に要約し、以下の JSON 形式で返してください。',
    '{',
    '  "summary": "全体の概要",',
    '  "keyPoints": ["主要なポイント"],',
    '  "hooks": ["効果的だった掴み"],',
    '  "ctaIdeas": ["応用できそうなCTA案"]',
    '}',
    '原文や長文の書き起こしは含めず、抽象化された要約のみ返してください。',
  ].join('\n');
}

async function insertTranscript(
  bigquery: BigQuery,
  config: ReturnType<typeof loadInstagramConfig>,
  row: PendingRow,
  payload: TranscriptPayload,
): Promise<void> {
  const dataset = bigquery.dataset(config.dataset);
  const table = dataset.table('competitor_reels_transcripts');
  await table.insert([
    {
      snapshot_date: row.snapshot_date,
      instagram_media_id: row.instagram_media_id,
      drive_file_id: row.drive_file_id,
      summary: payload.summary,
      key_points: payload.keyPoints ?? [],
      hooks: payload.hooks ?? [],
      cta_ideas: payload.ctaIdeas ?? [],
    },
  ]);
  console.log(`[instagram/transcribe] Saved transcript for ${row.instagram_media_id}`);
}

async function deleteGeminiFile(fileUri: string, apiKey: string): Promise<void> {
  const fileId = fileUri.split('/').pop();
  if (!fileId) {
    return;
  }
  await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${fileId}`, {
    method: 'DELETE',
    headers: { 'x-goog-api-key': apiKey },
  });
}

main().catch((error) => {
  console.error('[instagram/transcribe] Failed', error);
  process.exitCode = 1;
});
