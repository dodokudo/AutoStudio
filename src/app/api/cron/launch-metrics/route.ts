import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import crypto from 'node:crypto';
import { loadLstepConfig } from '@/lib/lstep/config';
import { runBroadcastScrape } from '@/lib/lstep/messageScraper';
import {
  generateSchedule,
  getPendingMeasurements,
  insertSchedule,
  completeMeasurement,
  failMeasurement,
  getKnownBroadcastIds,
  insertBroadcastMetric,
  insertUrlMetrics,
  parseSentAt,
} from '@/lib/lstep/messageScheduler';
import type {
  BroadcastMetricRow,
  MeasurementScheduleRow,
} from '@/lib/lstep/messageTypes';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for Playwright scraping

/**
 * Cron endpoint for Launch metrics collection.
 * Runs every 15 minutes to scrape Lステップ broadcast metrics.
 */
export async function GET() {
  const startTime = Date.now();

  try {
    const config = loadLstepConfig();
    const storage = new Storage();
    const bq = new BigQuery({ projectId: config.projectId });

    console.log('[launch-metrics] 配信メトリクス取得開始...');

    // Step 1: Scrape from Lステップ
    const { broadcasts, urlMetrics } = await runBroadcastScrape(storage, config);
    console.log(`[launch-metrics] ${broadcasts.length}件の配信を取得`);

    const now = new Date();
    let snapshotCount = 0;
    let scheduleCount = 0;

    // Step 1.5: Insert current snapshot metrics for ALL scraped broadcasts
    for (const broadcast of broadcasts) {
      try {
        const sentDate = parseSentAt(broadcast.sentAt);
        const elapsedMinutes = Math.round(
          (now.getTime() - sentDate.getTime()) / 60000,
        );

        if (broadcast.deliveryCount > 0) {
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
          snapshotCount++;
        }
      } catch {
        // Non-fatal
      }
    }

    // Step 2: Detect new broadcasts and register schedules
    const knownIds = await getKnownBroadcastIds(bq, config);
    const newBroadcasts = broadcasts.filter((b) => !knownIds.has(b.broadcastId));

    for (const broadcast of newBroadcasts) {
      try {
        const schedule = generateSchedule(broadcast);
        if (schedule.length > 0) {
          const rows: MeasurementScheduleRow[] = schedule.map((s) => ({
            ...s,
            id: crypto.randomUUID(),
          }));
          await insertSchedule(bq, config, rows);
          scheduleCount += rows.length;
        }
      } catch {
        // Non-fatal
      }
    }

    // Step 3: Process pending scheduled measurements
    const pending = await getPendingMeasurements(bq, config);
    let successCount = 0;
    let failCount = 0;

    for (const measurement of pending) {
      try {
        const broadcast = broadcasts.find(
          (b) => b.broadcastId === measurement.broadcast_id,
        );
        if (!broadcast) {
          await failMeasurement(bq, config, measurement.id, '配信データ未取得');
          failCount++;
          continue;
        }

        const sentDate = new Date(measurement.sent_at);
        const elapsedMinutes = Math.round(
          (now.getTime() - sentDate.getTime()) / 60000,
        );

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
      } catch {
        failCount++;
      }
    }

    // Step 4: Insert URL metrics
    if (urlMetrics.length > 0) {
      await insertUrlMetrics(bq, config, urlMetrics, now);
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      broadcasts: broadcasts.length,
      snapshotsSaved: snapshotCount,
      newSchedules: scheduleCount,
      pendingProcessed: { success: successCount, failed: failCount },
      urlMetrics: urlMetrics.length,
      duration: `${duration}ms`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[launch-metrics] Error:', msg);
    return NextResponse.json(
      { success: false, error: msg, duration: `${Date.now() - startTime}ms` },
      { status: 500 },
    );
  }
}
