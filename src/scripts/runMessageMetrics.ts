/**
 * runMessageMetrics.ts
 *
 * LINE配信メトリクス自動取得パイプライン
 *
 * 1. Lstep管理画面から一斉配信一覧をスクレイプ
 * 2. 新規配信を検出し、計測スケジュールを生成
 * 3. 計測スケジュールが到来した配信のメトリクスを取得
 * 4. BigQueryに保存
 *
 * Usage: npx tsx src/scripts/runMessageMetrics.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import crypto from 'node:crypto';
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import { loadLstepConfig } from '@/lib/lstep/config';
import { sendAlertEmail } from '@/lib/lstep/emailNotify';
import {
  generateSchedule,
  getPendingMeasurements,
  insertSchedule,
  completeMeasurement,
  failMeasurement,
  getKnownBroadcastIds,
  insertBroadcastMetric,
  insertUrlMetrics,
} from '@/lib/lstep/messageScheduler';
import type {
  BroadcastMetricRow,
  MeasurementScheduleRow,
  ScrapedBroadcast,
  ScrapedUrlMetric,
} from '@/lib/lstep/messageTypes';

// ---------------------------------------------------------------------------
// Scrape stub: replace with actual Playwright scraper when ready
// ---------------------------------------------------------------------------

interface BroadcastScrapeResult {
  broadcasts: ScrapedBroadcast[];
  urlMetrics: ScrapedUrlMetric[];
}

/**
 * Scrape broadcast list and URL metrics from the Lstep management screen.
 */
async function scrapeFromLstep(
  storage: Storage,
  config: ReturnType<typeof loadLstepConfig>,
): Promise<BroadcastScrapeResult> {
  const { runBroadcastScrape } = await import('@/lib/lstep/messageScraper');
  return runBroadcastScrape(storage, config);
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = loadLstepConfig();
  const storage = new Storage();
  const bq = new BigQuery({ projectId: config.projectId });

  console.log('[metrics] 配信メトリクス取得開始...');

  // -----------------------------------------------------------------------
  // Step 1: Scrape broadcasts from Lstep management screen
  // -----------------------------------------------------------------------
  const { broadcasts, urlMetrics } = await scrapeFromLstep(storage, config);
  console.log(`[metrics] ${broadcasts.length}件の配信を取得`);

  if (broadcasts.length === 0) {
    console.log('[metrics] 配信データなし。計測スケジュールの処理のみ実行します');
  }

  // -----------------------------------------------------------------------
  // Step 2: Detect new broadcasts and register measurement schedules
  // -----------------------------------------------------------------------
  const knownIds = await getKnownBroadcastIds(bq, config);
  const newBroadcasts = broadcasts.filter((b) => !knownIds.has(b.broadcastId));

  if (newBroadcasts.length > 0) {
    console.log(`[metrics] ${newBroadcasts.length}件の新規配信を検出`);
    for (const broadcast of newBroadcasts) {
      const schedule = generateSchedule(broadcast);
      if (schedule.length === 0) {
        console.log(
          `[metrics] ${broadcast.broadcastName}: 全計測ポイントが過去のためスキップ`,
        );
        continue;
      }
      const rows: MeasurementScheduleRow[] = schedule.map((s) => ({
        ...s,
        id: crypto.randomUUID(),
      }));
      await insertSchedule(bq, config, rows);
      console.log(
        `[metrics] ${broadcast.broadcastName}: ${rows.length}件の計測スケジュールを登録`,
      );
    }
  } else if (broadcasts.length > 0) {
    console.log('[metrics] 新規配信なし');
  }

  // -----------------------------------------------------------------------
  // Step 3: Process pending measurements that are due
  // -----------------------------------------------------------------------
  const pending = await getPendingMeasurements(bq, config);
  console.log(`[metrics] ${pending.length}件の計測待ちあり`);

  const now = new Date();
  let successCount = 0;
  let failCount = 0;

  for (const measurement of pending) {
    try {
      // Find current scrape data for this broadcast
      const broadcast = broadcasts.find(
        (b) => b.broadcastId === measurement.broadcast_id,
      );
      if (!broadcast) {
        console.warn(
          `[metrics] 配信 ${measurement.broadcast_id} (${measurement.broadcast_name}) のデータが見つからない`,
        );
        await failMeasurement(
          bq,
          config,
          measurement.id,
          '配信データ未取得 - スクレイプ結果に該当配信なし',
        );
        failCount++;
        continue;
      }

      // Calculate actual elapsed minutes from sent_at to now
      const sentDate = new Date(measurement.sent_at);
      const elapsedMinutes = Math.round(
        (now.getTime() - sentDate.getTime()) / 60000,
      );

      // Build and insert the metric row
      const metricRow: BroadcastMetricRow = {
        measured_at: now.toISOString(),
        broadcast_id: broadcast.broadcastId,
        broadcast_name: broadcast.broadcastName,
        sent_at: broadcast.sentAt,
        delivery_count: broadcast.deliveryCount,
        open_count: broadcast.openCount,
        open_rate: broadcast.openRate,
        elapsed_minutes: elapsedMinutes,
      };

      await insertBroadcastMetric(bq, config, metricRow);
      await completeMeasurement(bq, config, measurement.id);
      successCount++;

      console.log(
        `[metrics] ${broadcast.broadcastName} (${elapsedMinutes}分後): 開封率 ${broadcast.openRate}%`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await failMeasurement(bq, config, measurement.id, msg);
      failCount++;
      console.error(
        `[metrics] 計測失敗 ${measurement.broadcast_id}: ${msg}`,
      );
    }
  }

  if (pending.length > 0) {
    console.log(
      `[metrics] 計測結果: 成功 ${successCount}件 / 失敗 ${failCount}件`,
    );
  }

  // -----------------------------------------------------------------------
  // Step 4: Insert URL click metrics from current scrape
  // -----------------------------------------------------------------------
  if (urlMetrics.length > 0) {
    await insertUrlMetrics(bq, config, urlMetrics, now);
    console.log(`[metrics] ${urlMetrics.length}件のURL計測データを保存`);
  }

  // -----------------------------------------------------------------------
  // Alert on repeated failures
  // -----------------------------------------------------------------------
  if (failCount > 0 && failCount === pending.length && pending.length >= 3) {
    try {
      await sendAlertEmail(config, {
        subject: `${config.emailSubjectPrefix} 配信メトリクス全件失敗`,
        body: `${pending.length}件の計測が全て失敗しました。スクレイパーの状態を確認してください。`,
      });
    } catch (alertError) {
      console.error('[metrics] アラートメール送信失敗:', alertError);
    }
  }

  console.log('[metrics] 完了');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((error) => {
  console.error('[metrics] パイプラインエラー:', error);
  process.exitCode = 1;
});
