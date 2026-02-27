import { BigQuery } from '@google-cloud/bigquery';
import { LstepConfig } from './config';
import type {
  MeasurementScheduleRow,
  BroadcastMetricRow,
  ScrapedBroadcast,
  ScrapedUrlMetric,
} from './messageTypes';
import { MEASUREMENT_POINTS, ABSOLUTE_MEASUREMENT_HOURS } from './messageTypes';

/** JST offset in milliseconds (+09:00) */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Parse a Japanese datetime string like "2026/02/27 18:00" into a Date (JST).
 * Falls back to ISO string parsing if the Japanese format doesn't match.
 */
function parseSentAt(sentAt: string): Date {
  // Try "YYYY/MM/DD HH:mm" format first
  const jpMatch = sentAt.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (jpMatch) {
    const [, year, month, day, hour, minute] = jpMatch;
    // Create UTC date that represents this JST time
    const utcMs = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ) - JST_OFFSET_MS;
    return new Date(utcMs);
  }

  // Fallback: ISO string or other parseable format
  const parsed = new Date(sentAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`配信日時をパースできません: ${sentAt}`);
  }
  return parsed;
}

/**
 * Get the start of a JST day (00:00 JST) as UTC Date, offset by N days from sentAt.
 */
function getJstDayStart(sentAt: Date, dayOffset: number): Date {
  // Convert sentAt to JST
  const jstMs = sentAt.getTime() + JST_OFFSET_MS;
  const jstDate = new Date(jstMs);

  // Get start of that JST day
  const startOfDay = Date.UTC(
    jstDate.getUTCFullYear(),
    jstDate.getUTCMonth(),
    jstDate.getUTCDate() + dayOffset,
    0,
    0,
    0,
  );

  // Convert back to UTC
  return new Date(startOfDay - JST_OFFSET_MS);
}

/**
 * Generate measurement schedule for a newly detected broadcast.
 *
 * T1-T4: relative to sent_at (30m, 1h, 12h, 24h)
 * T5-T12: absolute times (9:00/21:00 JST on days 2-5 after broadcast)
 *
 * Skips any measure_at that is already in the past.
 */
export function generateSchedule(
  broadcast: ScrapedBroadcast,
): Omit<MeasurementScheduleRow, 'id'>[] {
  const sentAt = parseSentAt(broadcast.sentAt);
  const now = new Date();
  const schedule: Omit<MeasurementScheduleRow, 'id'>[] = [];

  // T1-T4: relative measurement points
  for (const point of MEASUREMENT_POINTS) {
    const measureAt = new Date(sentAt.getTime() + point.elapsedMinutes * 60 * 1000);
    if (measureAt.getTime() <= now.getTime()) {
      continue;
    }
    schedule.push({
      broadcast_id: broadcast.broadcastId,
      broadcast_name: broadcast.broadcastName,
      sent_at: sentAt.toISOString(),
      measure_at: measureAt.toISOString(),
      elapsed_minutes: point.elapsedMinutes,
      status: 'pending',
    });
  }

  // T5-T12: absolute measurement points (9:00 / 21:00 JST on days 2-5)
  for (const absPoint of ABSOLUTE_MEASUREMENT_HOURS) {
    const dayStart = getJstDayStart(sentAt, absPoint.day);
    const measureAt = new Date(dayStart.getTime() + absPoint.hour * 60 * 60 * 1000);
    if (measureAt.getTime() <= now.getTime()) {
      continue;
    }
    const elapsedMinutes = Math.round(
      (measureAt.getTime() - sentAt.getTime()) / 60000,
    );
    schedule.push({
      broadcast_id: broadcast.broadcastId,
      broadcast_name: broadcast.broadcastName,
      sent_at: sentAt.toISOString(),
      measure_at: measureAt.toISOString(),
      elapsed_minutes: elapsedMinutes,
      status: 'pending',
    });
  }

  return schedule;
}

/**
 * Get pending measurement tasks that are due now.
 */
export async function getPendingMeasurements(
  bq: BigQuery,
  config: LstepConfig,
): Promise<MeasurementScheduleRow[]> {
  const query = `
    SELECT
      id,
      broadcast_id,
      broadcast_name,
      CAST(sent_at AS STRING) AS sent_at,
      CAST(measure_at AS STRING) AS measure_at,
      elapsed_minutes,
      status,
      CAST(completed_at AS STRING) AS completed_at,
      error_message
    FROM \`${config.projectId}.${config.dataset}.measurement_schedule\`
    WHERE status = 'pending'
      AND measure_at <= CURRENT_TIMESTAMP()
    ORDER BY measure_at ASC
  `;

  const [rows] = await bq.query({ query, useLegacySql: false });
  return (rows ?? []) as MeasurementScheduleRow[];
}

/**
 * Insert new schedule rows for a detected broadcast.
 * Uses parameterized queries to prevent SQL injection.
 */
export async function insertSchedule(
  bq: BigQuery,
  config: LstepConfig,
  rows: MeasurementScheduleRow[],
): Promise<void> {
  if (rows.length === 0) return;

  for (const r of rows) {
    const query = `
      INSERT INTO \`${config.projectId}.${config.dataset}.measurement_schedule\`
        (id, broadcast_id, broadcast_name, sent_at, measure_at, elapsed_minutes, status, completed_at, error_message)
      VALUES
        (@id, @broadcast_id, @broadcast_name, TIMESTAMP(@sent_at), TIMESTAMP(@measure_at), @elapsed_minutes, @status, NULL, NULL)
    `;

    await bq.query({
      query,
      useLegacySql: false,
      params: {
        id: r.id,
        broadcast_id: r.broadcast_id,
        broadcast_name: r.broadcast_name,
        sent_at: r.sent_at,
        measure_at: r.measure_at,
        elapsed_minutes: r.elapsed_minutes,
        status: r.status,
      },
    });
  }
}

/**
 * Mark a measurement as completed.
 */
export async function completeMeasurement(
  bq: BigQuery,
  config: LstepConfig,
  scheduleId: string,
): Promise<void> {
  const query = `
    UPDATE \`${config.projectId}.${config.dataset}.measurement_schedule\`
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP()
    WHERE id = @id
  `;

  await bq.query({
    query,
    useLegacySql: false,
    params: { id: scheduleId },
  });
}

/**
 * Mark a measurement as failed.
 */
export async function failMeasurement(
  bq: BigQuery,
  config: LstepConfig,
  scheduleId: string,
  error: string,
): Promise<void> {
  const query = `
    UPDATE \`${config.projectId}.${config.dataset}.measurement_schedule\`
    SET status = 'failed', error_message = @error
    WHERE id = @id
  `;

  await bq.query({
    query,
    useLegacySql: false,
    params: { id: scheduleId, error },
  });
}

/**
 * Get known broadcast IDs (to detect new broadcasts vs already-tracked ones).
 */
export async function getKnownBroadcastIds(
  bq: BigQuery,
  config: LstepConfig,
): Promise<Set<string>> {
  const query = `
    SELECT DISTINCT broadcast_id
    FROM \`${config.projectId}.${config.dataset}.measurement_schedule\`
  `;

  const [rows] = await bq.query({ query, useLegacySql: false });
  const ids = (rows ?? []).map(
    (row: { broadcast_id: string }) => row.broadcast_id,
  );
  return new Set(ids);
}

/**
 * Insert a single broadcast metric row.
 */
export async function insertBroadcastMetric(
  bq: BigQuery,
  config: LstepConfig,
  row: BroadcastMetricRow,
): Promise<void> {
  const query = `
    INSERT INTO \`${config.projectId}.${config.dataset}.broadcast_metrics\`
      (measured_at, broadcast_id, broadcast_name, sent_at, delivery_count, open_count, open_rate, elapsed_minutes)
    VALUES
      (TIMESTAMP(@measured_at), @broadcast_id, @broadcast_name, @sent_at, @delivery_count, @open_count, @open_rate, @elapsed_minutes)
  `;

  await bq.query({
    query,
    useLegacySql: false,
    params: {
      measured_at: row.measured_at,
      broadcast_id: row.broadcast_id,
      broadcast_name: row.broadcast_name,
      sent_at: row.sent_at,
      delivery_count: row.delivery_count,
      open_count: row.open_count,
      open_rate: row.open_rate,
      elapsed_minutes: row.elapsed_minutes,
    },
  });
}

/**
 * Insert URL click metric rows.
 * Uses parameterized queries to prevent SQL injection.
 */
export async function insertUrlMetrics(
  bq: BigQuery,
  config: LstepConfig,
  metrics: ScrapedUrlMetric[],
  measuredAt: Date,
): Promise<void> {
  if (metrics.length === 0) return;

  const measuredAtIso = measuredAt.toISOString();

  for (const m of metrics) {
    const query = `
      INSERT INTO \`${config.projectId}.${config.dataset}.url_click_metrics\`
        (measured_at, url_id, url_name, total_clicks, unique_visitors, click_rate, elapsed_minutes)
      VALUES
        (TIMESTAMP(@measured_at), @url_id, @url_name, @total_clicks, @unique_visitors, @click_rate, 0)
    `;

    await bq.query({
      query,
      useLegacySql: false,
      params: {
        measured_at: measuredAtIso,
        url_id: m.urlId,
        url_name: m.urlName,
        total_clicks: m.totalClicks,
        unique_visitors: m.uniqueVisitors,
        click_rate: m.clickRate,
      },
    });
  }
}
