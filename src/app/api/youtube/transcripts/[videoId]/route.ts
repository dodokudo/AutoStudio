import { NextResponse } from 'next/server';
import { resolveProjectId } from '@/lib/bigquery';
import { createYoutubeBigQueryContext, ensureYoutubeTables } from '@/lib/youtube/bigquery';
import { getYoutubeVideoTranscript } from '@/lib/youtube/transcripts';

export const dynamic = 'force-dynamic';

const DATASET_ID = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';

export async function GET(
  _request: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: '動画IDが不正です' }, { status: 400 });
  }

  try {
    const projectId = resolveProjectId();
    const bigqueryContext = createYoutubeBigQueryContext(projectId, DATASET_ID);
    await ensureYoutubeTables(bigqueryContext);
    const transcript = await getYoutubeVideoTranscript(bigqueryContext, videoId);
    if (!transcript) {
      return NextResponse.json({ error: '文字起こしはまだ完了していません' }, { status: 404 });
    }
    return NextResponse.json({ transcript });
  } catch (error) {
    console.error('[youtube/transcripts][GET] error', error);
    return NextResponse.json({ error: '文字起こしの取得に失敗しました' }, { status: 500 });
  }
}
