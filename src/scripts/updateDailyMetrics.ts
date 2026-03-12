/**
 * updateDailyMetrics スクリプト（統合版）
 *
 * 1. tag_metricsの最新値からKPI実績（各ステップactual + セミナー日別recruitActual）を同期
 * 2. tag_metricsの日別差分 + lstep_friends_rawの日別新規登録数からdailyMetricsを計算
 * 3. KPIデータに反映して保存
 *
 * crontab: 毎日0:15 JST に自動実行（tag_metricsの毎時スクレイピング直後）
 *
 * Usage:
 *   npx tsx src/scripts/updateDailyMetrics.ts [funnelId]
 *
 * デフォルト funnelId: funnel-1770198372071（3月ローンチ）
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { SEGMENT_CUTOFF_DATE } from '@/lib/launch-constants';
import type { LaunchKpi, DailyMetric } from '@/types/launch';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
const DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
const KPI_TABLE = `${PROJECT_ID}.${DATASET}.launch_kpi`;
const TAG_TABLE = `${PROJECT_ID}.${DATASET}.tag_metrics`;
const FRIENDS_TABLE = `${PROJECT_ID}.${DATASET}.lstep_friends_raw`;

const DEFAULT_FUNNEL_ID = 'funnel-1770198372071';

// ─── タグ→KPI実績値マッピング（sync-tagsと同一ロジック） ───

interface TagMapping {
  prefix: string;
  field: string; // ドット区切りパス
}

const TAG_MAPPINGS: TagMapping[] = [
  { prefix: '3M:動画LP遷移', field: 'videoViewers.actual' },
  { prefix: '3M:セミナー申込済み', field: 'seminarApplications.actual' },
  { prefix: '3M:セミナーフォーム遷移', field: 'seminarApplications.formVisits' },
  { prefix: '3M:セミナー参加', field: 'seminarApplications.attendActual' },
  { prefix: '3M:FE購入', field: 'frontend.actual' },
  { prefix: '3M:BE購入', field: 'backend.actual' },
  { prefix: '3M:Threads投稿流入', field: '_threads_sub' },
  { prefix: '3M:Threads固定ポスト流入', field: '_threads_sub' },
  { prefix: '3M:Threadsプロフィール流入', field: '_threads_sub' },
  { prefix: '3M:流入', field: '_threads_total' },
  { prefix: '3M:IG流入', field: 'inflow.instagram.actual' },
  { prefix: '3M:動画視聴', field: 'videoViewers.watchActual' },
  { prefix: '3M:特典　電子書籍', field: 'videoViewers.ebookActual' },
  { prefix: '3M:電子書籍閲覧', field: 'videoViewers.ebookViewActual' },
  { prefix: '3M:アンケート回答済み', field: 'videoViewers.surveyActual' },
  { prefix: '3M:事前反応', field: 'videoViewers.preEngageActual' },
];

/** セミナー日付タグ: "3M:3/14" or "3M:3/14 【追加時】..." */
const SEMINAR_DATE_RE = /^3M:(\d{1,2})\/(\d{1,2})(\s|$)/;

function setNestedValue(obj: Record<string, unknown>, path: string, value: number): void {
  const keys = path.split('.');
  let current = obj as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] === undefined || current[keys[i]] === null) {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

// ─── dailyMetrics用マッピング ───

interface DailyTagMapping {
  prefix: string;
  field: keyof Omit<DailyMetric, 'date'>;
}

const DAILY_TAG_MAPPINGS: DailyTagMapping[] = [
  { prefix: '3M:動画LP遷移', field: 'videoViewers' },
  { prefix: '3M:セミナー申込済み', field: 'seminarApplications' },
  { prefix: '3M:セミナー参加', field: 'seminarAttendees' },
  { prefix: '3M:FE購入', field: 'frontendPurchases' },
  { prefix: '3M:BE購入', field: 'backendPurchases' },
];

interface TagSnapshotRow {
  snapshot_date: string;
  tag_name: string;
  friend_count: number;
}

interface FriendsRow {
  reg_date: string;
  new_count: number;
}

async function main(): Promise<void> {
  const funnelId = process.argv[2] || DEFAULT_FUNNEL_ID;
  console.log(`[daily-update] funnelId: ${funnelId}`);
  console.log(`[daily-update] PROJECT_ID: ${PROJECT_ID}, DATASET: ${DATASET}`);

  const bq = createBigQueryClient(PROJECT_ID);

  // ═══════════════════════════════════════════════
  // STEP 1: 現在のKPIデータ取得
  // ═══════════════════════════════════════════════
  const [kpiRows] = await bq.query({
    query: `SELECT data FROM \`${KPI_TABLE}\` WHERE funnel_id = @funnelId LIMIT 1`,
    useLegacySql: false,
    params: { funnelId },
  });

  if (!kpiRows || kpiRows.length === 0) {
    console.error('[daily-update] KPIデータが見つかりません。先にKPI設定を保存してください。');
    process.exit(1);
  }

  const currentKpi: LaunchKpi = JSON.parse((kpiRows[0] as { data: string }).data);

  // 後方互換: benefitReceivers → videoViewers
  if ((currentKpi as unknown as Record<string, unknown>).benefitReceivers && !currentKpi.videoViewers) {
    currentKpi.videoViewers = (currentKpi as unknown as Record<string, unknown>).benefitReceivers as LaunchKpi['videoViewers'];
    delete (currentKpi as unknown as Record<string, unknown>).benefitReceivers;
  }

  // ═══════════════════════════════════════════════
  // STEP 2: タグ最新値 → KPI実績同期（sync-tags相当）
  // ═══════════════════════════════════════════════
  console.log('[daily-update] ── STEP2: タグ→KPI実績同期 ──');

  const [latestTags] = await bq.query({
    query: `
      SELECT tag_name, friend_count
      FROM \`${TAG_TABLE}\`
      QUALIFY ROW_NUMBER() OVER (PARTITION BY tag_name ORDER BY measured_at DESC) = 1
    `,
    useLegacySql: false,
  });

  if (latestTags && latestTags.length > 0) {
    const updates: Record<string, number> = {};
    let threadsSubTotal = 0;
    let threadsTotal = 0;
    const seminarDateCounts: Record<string, number> = {};

    for (const row of latestTags) {
      const tagName = (row as { tag_name: string }).tag_name;
      const count = Number((row as { friend_count: number }).friend_count);

      // 通常マッピング
      for (const mapping of TAG_MAPPINGS) {
        if (tagName.startsWith(mapping.prefix)) {
          if (mapping.field === '_threads_sub') {
            threadsSubTotal += count;
          } else if (mapping.field === '_threads_total') {
            threadsTotal = Math.max(threadsTotal, count);
          } else {
            const existing = updates[mapping.field] ?? 0;
            if (count > existing) {
              updates[mapping.field] = count;
            }
          }
          break;
        }
      }

      // セミナー日付タグ: "3M:3/14" → seminarDaysの該当日のrecruitActual
      const dateMatch = tagName.match(SEMINAR_DATE_RE);
      if (dateMatch) {
        const month = dateMatch[1].padStart(2, '0');
        const day = dateMatch[2].padStart(2, '0');
        const dateStr = `2026-${month}-${day}`;
        const existing = seminarDateCounts[dateStr] ?? 0;
        if (count > existing) {
          seminarDateCounts[dateStr] = count;
        }
      }
    }

    // Threads流入
    const threadsActual = threadsTotal > 0 ? threadsTotal : threadsSubTotal;
    if (threadsActual > 0) {
      updates['inflow.threads.actual'] = threadsActual;
    }

    // LINE登録数（既存/新規）
    try {
      const [friendsCountRows] = await bq.query({
        query: `
          WITH latest AS (
            SELECT MAX(snapshot_date) AS sd FROM \`${FRIENDS_TABLE}\`
          )
          SELECT
            COUNTIF(DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") < @cutoff) AS existing_count,
            COUNTIF(DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") >= @cutoff) AS new_count
          FROM \`${FRIENDS_TABLE}\` f
          JOIN latest l ON f.snapshot_date = l.sd
          WHERE f.friend_added_at IS NOT NULL AND f.blocked = 0
        `,
        useLegacySql: false,
        params: { cutoff: SEGMENT_CUTOFF_DATE },
      });

      if (friendsCountRows && friendsCountRows.length > 0) {
        const r = friendsCountRows[0] as { existing_count: number; new_count: number };
        updates['lineRegistration.newActual'] = Number(r.new_count);
      }
    } catch (e) {
      console.error('[daily-update] friends count取得失敗:', e);
    }

    // セミナー日別 recruitActual 反映
    for (const [dateStr, count] of Object.entries(seminarDateCounts)) {
      const seminarDay = currentKpi.seminarDays?.find((s) => s.date === dateStr);
      if (seminarDay) {
        seminarDay.recruitActual = count;
        console.log(`  セミナー ${dateStr}: recruitActual = ${count}`);
      }
    }

    // KPIオブジェクトに反映
    const kpiObj = currentKpi as unknown as Record<string, unknown>;
    for (const [path, value] of Object.entries(updates)) {
      setNestedValue(kpiObj, path, value);
    }

    console.log(`[daily-update] 同期完了: ${Object.keys(updates).length}フィールド + ${Object.keys(seminarDateCounts).length}セミナー日`);
    for (const [path, value] of Object.entries(updates)) {
      console.log(`  ${path} = ${value}`);
    }
  } else {
    console.warn('[daily-update] タグデータなし。実績同期をスキップ。');
  }

  // ═══════════════════════════════════════════════
  // STEP 3: dailyMetrics計算（日別差分チャート用）
  // ═══════════════════════════════════════════════
  console.log('[daily-update] ── STEP3: dailyMetrics計算 ──');

  // tag_metricsから日別スナップショットを取得
  const [tagSnapshots] = await bq.query({
    query: `
      WITH daily_latest AS (
        SELECT
          DATE(measured_at, "Asia/Tokyo") AS snapshot_date,
          tag_name,
          friend_count,
          ROW_NUMBER() OVER (
            PARTITION BY DATE(measured_at, "Asia/Tokyo"), tag_name
            ORDER BY measured_at DESC
          ) AS rn
        FROM \`${TAG_TABLE}\`
        WHERE tag_name LIKE '3M:%'
      )
      SELECT
        FORMAT_DATE('%Y-%m-%d', snapshot_date) AS snapshot_date,
        tag_name,
        friend_count
      FROM daily_latest
      WHERE rn = 1
      ORDER BY snapshot_date, tag_name
    `,
    useLegacySql: false,
  });

  console.log(`[daily-update] タグスナップショット行数: ${tagSnapshots?.length ?? 0}`);

  // lstep_friends_rawから日別新規LINE登録数を取得
  const [friendsRows] = await bq.query({
    query: `
      WITH latest_snapshot AS (
        SELECT MAX(snapshot_date) AS sd FROM \`${FRIENDS_TABLE}\`
      )
      SELECT
        FORMAT_DATE('%Y-%m-%d', DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo")) AS reg_date,
        COUNT(*) AS new_count
      FROM \`${FRIENDS_TABLE}\` f
      JOIN latest_snapshot l ON f.snapshot_date = l.sd
      WHERE f.friend_added_at IS NOT NULL AND f.blocked = 0
      GROUP BY reg_date
      ORDER BY reg_date
    `,
    useLegacySql: false,
  });

  // 日別LINE登録数マップ
  const lineRegMap = new Map<string, number>();
  if (friendsRows) {
    for (const row of friendsRows as FriendsRow[]) {
      lineRegMap.set(row.reg_date, Number(row.new_count));
    }
  }

  // タグスナップショットを日別・prefixマッピング別にまとめる
  const tagByDate = new Map<string, Map<string, number>>();
  if (tagSnapshots) {
    for (const row of tagSnapshots as TagSnapshotRow[]) {
      const date = row.snapshot_date;
      const tagName = row.tag_name;
      const count = Number(row.friend_count);

      const mapping = DAILY_TAG_MAPPINGS.find(m => tagName.startsWith(m.prefix));
      if (!mapping) continue;

      if (!tagByDate.has(date)) {
        tagByDate.set(date, new Map());
      }
      const dateMap = tagByDate.get(date)!;
      const existing = dateMap.get(mapping.field) ?? 0;
      if (count > existing) {
        dateMap.set(mapping.field, count);
      }
    }
  }

  // 日別差分を計算
  const sortedDates = Array.from(tagByDate.keys()).sort();
  const dailyMetrics: DailyMetric[] = [];

  const allDates = new Set<string>();
  for (const d of sortedDates) allDates.add(d);
  for (const d of lineRegMap.keys()) allDates.add(d);
  const allDatesSorted = Array.from(allDates).sort();

  console.log(`[daily-update] 対象日数: ${allDatesSorted.length}`);
  if (allDatesSorted.length > 0) {
    console.log(`[daily-update] 期間: ${allDatesSorted[0]} 〜 ${allDatesSorted[allDatesSorted.length - 1]}`);
  }

  for (const date of allDatesSorted) {
    const metric: DailyMetric = { date };

    const lineReg = lineRegMap.get(date);
    if (lineReg !== undefined) {
      metric.lineRegistrations = lineReg;
    }

    const currentTags = tagByDate.get(date);
    const dateIdx = sortedDates.indexOf(date);
    const prevDate = dateIdx > 0 ? sortedDates[dateIdx - 1] : null;
    const prevTags = prevDate ? tagByDate.get(prevDate) : null;

    for (const mapping of DAILY_TAG_MAPPINGS) {
      const currentCount = currentTags?.get(mapping.field) ?? 0;
      const prevCount = prevTags?.get(mapping.field) ?? 0;

      if (dateIdx === 0 && currentTags?.has(mapping.field)) {
        metric[mapping.field] = currentCount;
      } else if (currentTags?.has(mapping.field)) {
        const diff = currentCount - prevCount;
        metric[mapping.field] = Math.max(0, diff);
      }
    }

    const hasData = metric.lineRegistrations !== undefined
      || metric.videoViewers !== undefined
      || metric.seminarApplications !== undefined
      || metric.seminarAttendees !== undefined
      || metric.frontendPurchases !== undefined
      || metric.backendPurchases !== undefined;

    if (hasData) {
      dailyMetrics.push(metric);
    }
  }

  console.log(`[daily-update] 生成したdailyMetrics: ${dailyMetrics.length}日分`);

  for (const m of dailyMetrics.slice(0, 5)) {
    console.log(`  ${m.date}: LINE=${m.lineRegistrations ?? '-'} 特典=${m.videoViewers ?? '-'} セミ申込=${m.seminarApplications ?? '-'} セミ参加=${m.seminarAttendees ?? '-'} FE=${m.frontendPurchases ?? '-'} BE=${m.backendPurchases ?? '-'}`);
  }
  if (dailyMetrics.length > 5) {
    console.log(`  ... (残り ${dailyMetrics.length - 5} 日)`);
    for (const m of dailyMetrics.slice(-3)) {
      console.log(`  ${m.date}: LINE=${m.lineRegistrations ?? '-'} 特典=${m.videoViewers ?? '-'} セミ申込=${m.seminarApplications ?? '-'} セミ参加=${m.seminarAttendees ?? '-'} FE=${m.frontendPurchases ?? '-'} BE=${m.backendPurchases ?? '-'}`);
    }
  }

  // ═══════════════════════════════════════════════
  // STEP 4: KPIに反映 + 保存
  // ═══════════════════════════════════════════════
  currentKpi.dailyMetrics = dailyMetrics;

  console.log('[daily-update] ── STEP4: KPIデータ保存 ──');
  const dataJson = JSON.stringify(currentKpi);

  await bq.query({
    query: `DELETE FROM \`${KPI_TABLE}\` WHERE funnel_id = @funnelId`,
    useLegacySql: false,
    params: { funnelId },
  });

  await bq.query({
    query: `
      INSERT INTO \`${KPI_TABLE}\` (funnel_id, data, updated_at)
      VALUES (@funnelId, @data, CURRENT_TIMESTAMP())
    `,
    useLegacySql: false,
    params: { funnelId, data: dataJson },
  });

  // 検証
  const [verifyRows] = await bq.query({
    query: `SELECT data FROM \`${KPI_TABLE}\` WHERE funnel_id = @funnelId LIMIT 1`,
    useLegacySql: false,
    params: { funnelId },
  });

  if (!verifyRows || verifyRows.length === 0) {
    console.error('[daily-update] 検証失敗: KPIデータが保存されていません');
    process.exit(1);
  }

  const savedKpi: LaunchKpi = JSON.parse((verifyRows[0] as { data: string }).data);
  const savedCount = savedKpi.dailyMetrics?.length ?? 0;

  console.log(`[daily-update] 完了: ${savedCount}日分のdailyMetrics保存`);

  // セミナー日別サマリー
  if (savedKpi.seminarDays?.length) {
    console.log('[daily-update] セミナー日別:');
    for (const d of savedKpi.seminarDays) {
      console.log(`  ${d.date}: 集客=${d.recruitActual}/${d.recruitTarget} 参加=${d.attendActual}/${d.attendTarget} 購入=${d.purchaseCount ?? 0}/${d.purchaseTarget ?? 0}`);
    }
  }

  // 累計サマリー
  let totalLine = 0, totalVideo = 0, totalSemApp = 0, totalSemAtt = 0, totalFe = 0, totalBe = 0;
  for (const m of dailyMetrics) {
    totalLine += m.lineRegistrations ?? 0;
    totalVideo += m.videoViewers ?? 0;
    totalSemApp += m.seminarApplications ?? 0;
    totalSemAtt += m.seminarAttendees ?? 0;
    totalFe += m.frontendPurchases ?? 0;
    totalBe += m.backendPurchases ?? 0;
  }
  console.log('[daily-update] dailyMetrics累計:');
  console.log(`  LINE登録: ${totalLine}`);
  console.log(`  特典受取: ${totalVideo}`);
  console.log(`  セミナー申込: ${totalSemApp}`);
  console.log(`  セミナー参加: ${totalSemAtt}`);
  console.log(`  FE購入: ${totalFe}`);
  console.log(`  BE購入: ${totalBe}`);
}

main().catch((err) => {
  console.error('[daily-update] エラー:', err);
  process.exit(1);
});
