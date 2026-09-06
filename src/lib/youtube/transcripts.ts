import type { YoutubeBigQueryContext } from './bigquery';

export interface YoutubeTranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface YoutubeTranscriptChapter {
  start: number;
  end: number;
  title: string;
}

export interface YoutubeVideoTranscript {
  videoId: string;
  sourceUrl: string;
  language: string;
  model: string;
  status: string;
  rawText: string;
  cleanedText: string;
  segments: YoutubeTranscriptSegment[];
  chapters: YoutubeTranscriptChapter[];
  chapterSource: 'youtube' | 'auto';
  transcribedAt: string;
  updatedAt: string;
}

function timestampValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    return String((value as { value: unknown }).value);
  }
  return String(value ?? '');
}

function parseSegments(raw: unknown): YoutubeTranscriptSegment[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((segment) => {
        if (!segment || typeof segment !== 'object') return null;
        const record = segment as Record<string, unknown>;
        const text = String(record.text ?? '').trim();
        if (!text) return null;
        return {
          start: Number(record.start ?? 0),
          end: Number(record.end ?? 0),
          text,
        };
      })
      .filter((segment): segment is YoutubeTranscriptSegment => segment !== null);
  } catch {
    return [];
  }
}

function parseChapters(raw: unknown): YoutubeTranscriptChapter[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((chapter) => {
        if (!chapter || typeof chapter !== 'object') return null;
        const record = chapter as Record<string, unknown>;
        const title = String(record.title ?? '').trim();
        if (!title) return null;
        return {
          start: Number(record.start ?? 0),
          end: Number(record.end ?? 0),
          title,
        };
      })
      .filter((chapter): chapter is YoutubeTranscriptChapter => chapter !== null);
  } catch {
    return [];
  }
}

export async function upsertYoutubeVideoTranscript(
  context: YoutubeBigQueryContext,
  transcript: YoutubeVideoTranscript,
): Promise<void> {
  const { client, projectId, datasetId } = context;
  await client.query({
    query: `
      MERGE \`${projectId}.${datasetId}.youtube_video_transcripts\` target
      USING (
        SELECT
          @video_id AS video_id,
          @source_url AS source_url,
          @language AS language,
          @model AS model,
          @status AS status,
          @raw_text AS raw_text,
          @cleaned_text AS cleaned_text,
          @segments_json AS segments_json,
          @chapters_json AS chapters_json,
          @chapter_source AS chapter_source,
          TIMESTAMP(@transcribed_at) AS transcribed_at,
          TIMESTAMP(@updated_at) AS updated_at
      ) source
      ON target.video_id = source.video_id
      WHEN MATCHED THEN UPDATE SET
        source_url = source.source_url,
        language = source.language,
        model = source.model,
        status = source.status,
        raw_text = source.raw_text,
        cleaned_text = source.cleaned_text,
        segments_json = source.segments_json,
        chapters_json = source.chapters_json,
        chapter_source = source.chapter_source,
        transcribed_at = source.transcribed_at,
        updated_at = source.updated_at
      WHEN NOT MATCHED THEN INSERT (
        video_id,
        source_url,
        language,
        model,
        status,
        raw_text,
        cleaned_text,
        segments_json,
        chapters_json,
        chapter_source,
        transcribed_at,
        updated_at
      ) VALUES (
        source.video_id,
        source.source_url,
        source.language,
        source.model,
        source.status,
        source.raw_text,
        source.cleaned_text,
        source.segments_json,
        source.chapters_json,
        source.chapter_source,
        source.transcribed_at,
        source.updated_at
      )
    `,
    params: {
      video_id: transcript.videoId,
      source_url: transcript.sourceUrl,
      language: transcript.language,
      model: transcript.model,
      status: transcript.status,
      raw_text: transcript.rawText,
      cleaned_text: transcript.cleanedText,
      segments_json: JSON.stringify(transcript.segments),
      chapters_json: JSON.stringify(transcript.chapters),
      chapter_source: transcript.chapterSource,
      transcribed_at: transcript.transcribedAt,
      updated_at: transcript.updatedAt,
    },
  });
}

export async function getYoutubeVideoTranscript(
  context: YoutubeBigQueryContext,
  videoId: string,
): Promise<YoutubeVideoTranscript | null> {
  const { client, projectId, datasetId } = context;
  const [rows] = await client.query({
    query: `
      SELECT
        video_id,
        source_url,
        language,
        model,
        status,
        raw_text,
        cleaned_text,
        segments_json,
        chapters_json,
        chapter_source,
        transcribed_at,
        updated_at
      FROM \`${projectId}.${datasetId}.youtube_video_transcripts\`
      WHERE video_id = @video_id
        AND status = 'complete'
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    params: { video_id: videoId },
  });
  const row = (rows as Array<Record<string, unknown>>)[0];
  if (!row) return null;
  return {
    videoId: String(row.video_id),
    sourceUrl: String(row.source_url),
    language: String(row.language),
    model: String(row.model),
    status: String(row.status),
    rawText: String(row.raw_text ?? ''),
    cleanedText: String(row.cleaned_text ?? row.raw_text ?? ''),
    segments: parseSegments(row.segments_json),
    chapters: parseChapters(row.chapters_json),
    chapterSource: row.chapter_source === 'youtube' ? 'youtube' : 'auto',
    transcribedAt: timestampValue(row.transcribed_at),
    updatedAt: timestampValue(row.updated_at),
  };
}
