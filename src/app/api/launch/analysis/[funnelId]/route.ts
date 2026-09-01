import { NextResponse } from 'next/server';

import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { SEPTEMBER_LAUNCH_FUNNEL_ID } from '@/lib/launch-constants';
import { fetchSeptemberLaunchAnalysis } from '@/lib/lstep/septemberLaunchAnalysis';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
const DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ funnelId: string }> },
) {
  try {
    const { funnelId } = await params;

    if (funnelId !== SEPTEMBER_LAUNCH_FUNNEL_ID) {
      return NextResponse.json(
        { error: 'このローンチの分析設定はまだありません。' },
        { status: 404 },
      );
    }

    const bigquery = createBigQueryClient(PROJECT_ID);
    const analysis = await fetchSeptemberLaunchAnalysis(bigquery, PROJECT_ID, DATASET);

    return NextResponse.json(analysis, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[launch/analysis] Failed to fetch September launch analysis:', error);
    return NextResponse.json(
      { error: 'ローンチ分析データの取得に失敗しました。' },
      { status: 500 },
    );
  }
}
