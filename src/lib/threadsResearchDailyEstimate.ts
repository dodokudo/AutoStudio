/**
 * Daily view estimate for watched competitor accounts.
 *
 * The Threads public profile API only exposes `views_count` as a rolling
 * seven-day total, so the per-day figure is reconstructed by differencing:
 *
 *   daily(t) = total(t) - total(t - 1) + daily(t - 7)
 *
 * The first seven days have no prior estimate and are seeded as an even split
 * of the earliest total. Estimates therefore start rough and converge once a
 * full week of real differences exists. Each snapshot is collected at 04:15 JST,
 * so a snapshot dated D mostly reflects posts published on D - 1.
 */

import type { ProfileHistoryPoint } from '@/lib/threadsResearch';

export interface DailyViewEstimate {
  username: string;
  /** Snapshot date (YYYY-MM-DD). The posts that drove it were mostly published the day before. */
  snapshotDate: string;
  /** Rolling seven-day total reported by the API on this date. */
  sevenDayTotal: number;
  /** Raw difference against the previous snapshot. */
  deltaFromPrevious: number | null;
  /**
   * Reconstructed single-day views. Null when there is no previous snapshot, or when a
   * large post aged out of the seven-day window and the day's gain cannot be separated
   * from that drop (the raw delta is negative).
   */
  estimatedViews: number | null;
  /** Set when estimatedViews is null because of a window drop-out. */
  unknownReason?: 'dropout';
  /** True while the estimate still depends on the seeded first week. */
  seeded: boolean;
}

const WINDOW_DAYS = 7;

function dedupeLatestPerDay(points: ProfileHistoryPoint[]): ProfileHistoryPoint[] {
  const byDate = new Map<string, ProfileHistoryPoint>();
  for (const point of points) {
    const existing = byDate.get(point.snapshotDate);
    if (!existing || (point.collectedAt ?? '') > (existing.collectedAt ?? '')) {
      byDate.set(point.snapshotDate, point);
    }
  }
  return [...byDate.values()].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
}

export function estimateDailyViews(history: ProfileHistoryPoint[]): DailyViewEstimate[] {
  const byUser = new Map<string, ProfileHistoryPoint[]>();
  for (const point of history) {
    if (point.viewsCount === null) continue;
    const list = byUser.get(point.username) ?? [];
    list.push(point);
    byUser.set(point.username, list);
  }

  const results: DailyViewEstimate[] = [];
  for (const [username, points] of byUser) {
    const series = dedupeLatestPerDay(points);
    if (series.length === 0) continue;

    // Consecutive identical snapshots at the start are the same collection run.
    let start = 0;
    while (start + 1 < series.length && series[start + 1].viewsCount === series[start].viewsCount) {
      start += 1;
    }

    const seedTotal = series[start].viewsCount ?? 0;
    const dailies: number[] = Array.from({ length: WINDOW_DAYS }, () => seedTotal / WINDOW_DAYS);

    results.push({
      username,
      snapshotDate: series[start].snapshotDate,
      sevenDayTotal: seedTotal,
      deltaFromPrevious: null,
      estimatedViews: null,
      seeded: true,
    });

    for (let index = start + 1; index < series.length; index += 1) {
      const current = series[index].viewsCount ?? 0;
      const previous = series[index - 1].viewsCount ?? 0;
      const delta = current - previous;
      const dropped = dailies[dailies.length - WINDOW_DAYS];
      const raw = Math.round(delta + dropped);
      const estimate = raw >= 0 ? raw : null;
      dailies.push(estimate ?? 0);
      results.push({
        username,
        snapshotDate: series[index].snapshotDate,
        sevenDayTotal: current,
        deltaFromPrevious: delta,
        estimatedViews: estimate,
        ...(estimate === null ? { unknownReason: 'dropout' as const } : {}),
        seeded: index - start <= WINDOW_DAYS,
      });
    }
  }

  return results.sort(
    (a, b) => a.snapshotDate.localeCompare(b.snapshotDate) || a.username.localeCompare(b.username)
  );
}
