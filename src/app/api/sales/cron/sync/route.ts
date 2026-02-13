import { NextResponse } from 'next/server';
import { listAllCharges } from '@/lib/univapay/client';
import { upsertCharges, getLastSyncedAt } from '@/lib/sales/charges';
import { autoCategorizeCharges } from '@/lib/sales/categories';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handleSync() {
  const startTime = Date.now();

  try {
    console.log('[sales/cron/sync] Started at', new Date().toISOString());

    // 最終同期日時を確認
    const lastSyncedAt = await getLastSyncedAt();
    console.log('[sales/cron/sync] Last synced:', lastSyncedAt?.toISOString() ?? 'never');

    // UnivaPayから全件取得
    const charges = await listAllCharges({ mode: 'live' });
    console.log(`[sales/cron/sync] Fetched ${charges.length} charges from UnivaPay`);

    if (charges.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No charges to sync',
        timestamp: new Date().toISOString(),
      });
    }

    // BigQueryに保存（バッチ処理）
    const BATCH_SIZE = 500;
    let totalSaved = 0;

    for (let i = 0; i < charges.length; i += BATCH_SIZE) {
      const batch = charges.slice(i, i + BATCH_SIZE);
      const saved = await upsertCharges(batch);
      totalSaved += saved;
    }

    // 自動カテゴリ付与
    const autoCategorized = await autoCategorizeCharges();
    if (autoCategorized > 0) {
      console.log(`[sales/cron/sync] Auto-categorized: ${autoCategorized} charges`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('[sales/cron/sync] Completed:', {
      chargesFetched: charges.length,
      chargesSaved: totalSaved,
      autoCategorized,
      duration: `${duration}s`,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      chargesFetched: charges.length,
      chargesSaved: totalSaved,
      autoCategorized,
      duration: `${duration}s`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[sales/cron/sync] Failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return handleSync();
}

export async function POST() {
  return handleSync();
}
