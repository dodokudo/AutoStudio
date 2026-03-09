/**
 * updateDailyMetrics スクリプト
 * tag_metricsの日別差分 + lstep_friends_rawの日別新規登録数から
 * dailyMetricsを自動計算してKPIデータに投入する
 *
 * Usage:
 *   npx tsx src/scripts/updateDailyMetrics.ts [funnelId]
 *
 * デフォルト funnelId: funnel-1770198372071（3月ローンチ）
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import type { LaunchKpi, DailyMetric } from '@/types/launch';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
const DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
const KPI_TABLE = `${PROJECT_ID}.${DATASET}.launch_kpi`;
const TAG_TABLE = `${PROJECT_ID}.${DATASET}.tag_metrics`;
const FRIENDS_TABLE = `${PROJECT_ID}.${DATASET}.lstep_friends_raw`;

const DEFAULT_FUNNEL_ID = 'funnel-1770198372071';

/**
 * タグ名 → dailyMetricsフィールドのマッピング
 * tag_metricsのtag_nameのprefixでマッチする
 */
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
  console.log(`[daily-metrics] funnelId: ${funnelId}`);
  console.log(`[daily-metrics] PROJECT_ID: ${PROJECT_ID}, DATASET: ${DATASET}`);

  const bq = createBigQueryClient(PROJECT_ID);

  // 1. 現在のKPIデータ取得
  const [kpiRows] = await bq.query({
    query: `SELECT data FROM \`${KPI_TABLE}\` WHERE funnel_id = @funnelId LIMIT 1`,
    useLegacySql: false,
    params: { funnelId },
  });

  if (!kpiRows || kpiRows.length === 0) {
    console.error('[daily-metrics] KPIデータが見つかりません。先にKPI設定を保存してください。');
    process.exit(1);
  }

  const currentKpi: LaunchKpi = JSON.parse((kpiRows[0] as { data: string }).data);

  // 2. tag_metricsから日別スナップショットを取得
  //    各日の最後のスナップショット（その日の最大measured_at）のタグ人数を取る
  //    タグ名はprefixマッチ（同じprefixで複数のtag_nameバリアントがある）
  //    → 全3M:タグを取得してJS側でprefixマッチする（syncTagsToKpiと同じアプローチ）
  console.log('[daily-metrics] tag_metricsから日別スナップショットを取得中...');
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

  console.log(`[daily-metrics] タグスナップショット行数: ${tagSnapshots?.length ?? 0}`);

  // 3. lstep_friends_rawから日別新規LINE登録数を取得
  console.log('[daily-metrics] lstep_friends_rawから日別新規登録数を取得中...');
  const [friendsRows] = await bq.query({
    query: `
      WITH latest_snapshot AS (
        SELECT MAX(snapshot_date) AS sd
        FROM \`${FRIENDS_TABLE}\`
      )
      SELECT
        FORMAT_DATE('%Y-%m-%d', DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo")) AS reg_date,
        COUNT(*) AS new_count
      FROM \`${FRIENDS_TABLE}\` f
      JOIN latest_snapshot l ON f.snapshot_date = l.sd
      WHERE f.friend_added_at IS NOT NULL
        AND f.blocked = 0
      GROUP BY reg_date
      ORDER BY reg_date
    `,
    useLegacySql: false,
  });

  console.log(`[daily-metrics] 友だち登録日数: ${friendsRows?.length ?? 0}`);

  // 4. 日別LINE登録数マップを作成
  const lineRegMap = new Map<string, number>();
  if (friendsRows) {
    for (const row of friendsRows as FriendsRow[]) {
      lineRegMap.set(row.reg_date, Number(row.new_count));
    }
  }

  // 5. タグスナップショットを日別・prefixマッピング別にまとめる
  //    同じprefixの複数バリアント（アクション説明つき等）の中で最大値を取る
  //    { date -> { mappingField -> friend_count } }
  const tagByDate = new Map<string, Map<string, number>>();
  if (tagSnapshots) {
    for (const row of tagSnapshots as TagSnapshotRow[]) {
      const date = row.snapshot_date;
      const tagName = row.tag_name;
      const count = Number(row.friend_count);

      // prefixマッチでマッピングを見つける
      const mapping = DAILY_TAG_MAPPINGS.find(m => tagName.startsWith(m.prefix));
      if (!mapping) continue;

      if (!tagByDate.has(date)) {
        tagByDate.set(date, new Map());
      }
      const dateMap = tagByDate.get(date)!;
      // 同一prefix（=同一field）の複数バリアントは最大値を採用
      // （同じタグの異なるアクション説明バリアントは同じ人数を指すため）
      const existing = dateMap.get(mapping.field) ?? 0;
      if (count > existing) {
        dateMap.set(mapping.field, count);
      }
    }
  }

  // 6. 日別差分を計算
  //    各日のタグ人数 - 前日のタグ人数 = その日の増分
  const sortedDates = Array.from(tagByDate.keys()).sort();
  const dailyMetrics: DailyMetric[] = [];

  // 全日付を収集（タグデータ + LINE登録データ）
  const allDates = new Set<string>();
  for (const d of sortedDates) allDates.add(d);
  for (const d of lineRegMap.keys()) allDates.add(d);
  const allDatesSorted = Array.from(allDates).sort();

  console.log(`[daily-metrics] 対象日数: ${allDatesSorted.length}`);
  if (allDatesSorted.length > 0) {
    console.log(`[daily-metrics] 期間: ${allDatesSorted[0]} 〜 ${allDatesSorted[allDatesSorted.length - 1]}`);
  }

  for (const date of allDatesSorted) {
    const metric: DailyMetric = { date };

    // LINE登録数
    const lineReg = lineRegMap.get(date);
    if (lineReg !== undefined) {
      metric.lineRegistrations = lineReg;
    }

    // タグ差分を計算（tagByDateはfield名でキーイングされている）
    const currentTags = tagByDate.get(date);
    // 前日を探す（sortedDates内で1つ前の日付）
    const dateIdx = sortedDates.indexOf(date);
    const prevDate = dateIdx > 0 ? sortedDates[dateIdx - 1] : null;
    const prevTags = prevDate ? tagByDate.get(prevDate) : null;

    for (const mapping of DAILY_TAG_MAPPINGS) {
      const currentCount = currentTags?.get(mapping.field) ?? 0;
      const prevCount = prevTags?.get(mapping.field) ?? 0;

      if (dateIdx === 0 && currentTags?.has(mapping.field)) {
        // 最初の日は累積値をそのまま使う（ローンチ開始時点の実績）
        metric[mapping.field] = currentCount;
      } else if (currentTags?.has(mapping.field)) {
        const diff = currentCount - prevCount;
        metric[mapping.field] = Math.max(0, diff); // マイナスは0にクランプ
      }
    }

    // 何かデータがある日だけ追加
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

  console.log(`[daily-metrics] 生成したdailyMetrics: ${dailyMetrics.length}日分`);

  // サンプル表示
  for (const m of dailyMetrics.slice(0, 5)) {
    console.log(`  ${m.date}: LINE=${m.lineRegistrations ?? '-'} 特典=${m.videoViewers ?? '-'} セミ申込=${m.seminarApplications ?? '-'} セミ参加=${m.seminarAttendees ?? '-'} FE=${m.frontendPurchases ?? '-'} BE=${m.backendPurchases ?? '-'}`);
  }
  if (dailyMetrics.length > 5) {
    console.log(`  ... (残り ${dailyMetrics.length - 5} 日)`);
    // 最後の3日も表示
    for (const m of dailyMetrics.slice(-3)) {
      console.log(`  ${m.date}: LINE=${m.lineRegistrations ?? '-'} 特典=${m.videoViewers ?? '-'} セミ申込=${m.seminarApplications ?? '-'} セミ参加=${m.seminarAttendees ?? '-'} FE=${m.frontendPurchases ?? '-'} BE=${m.backendPurchases ?? '-'}`);
    }
  }

  // 7. KPIに反映
  currentKpi.dailyMetrics = dailyMetrics;

  // 8. 保存（DELETE + INSERT）
  console.log('[daily-metrics] KPIデータを保存中...');
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

  // 9. 検証
  const [verifyRows] = await bq.query({
    query: `SELECT data FROM \`${KPI_TABLE}\` WHERE funnel_id = @funnelId LIMIT 1`,
    useLegacySql: false,
    params: { funnelId },
  });

  if (!verifyRows || verifyRows.length === 0) {
    console.error('[daily-metrics] 検証失敗: KPIデータが保存されていません');
    process.exit(1);
  }

  const savedKpi: LaunchKpi = JSON.parse((verifyRows[0] as { data: string }).data);
  const savedCount = savedKpi.dailyMetrics?.length ?? 0;

  console.log(`[daily-metrics] 完了: ${savedCount}日分のdailyMetricsを保存しました`);

  // 累計サマリー表示
  let totalLine = 0, totalVideo = 0, totalSemApp = 0, totalSemAtt = 0, totalFe = 0, totalBe = 0;
  for (const m of dailyMetrics) {
    totalLine += m.lineRegistrations ?? 0;
    totalVideo += m.videoViewers ?? 0;
    totalSemApp += m.seminarApplications ?? 0;
    totalSemAtt += m.seminarAttendees ?? 0;
    totalFe += m.frontendPurchases ?? 0;
    totalBe += m.backendPurchases ?? 0;
  }
  console.log('[daily-metrics] 累計:');
  console.log(`  LINE登録: ${totalLine}`);
  console.log(`  特典受取: ${totalVideo}`);
  console.log(`  セミナー申込: ${totalSemApp}`);
  console.log(`  セミナー参加: ${totalSemAtt}`);
  console.log(`  FE購入: ${totalFe}`);
  console.log(`  BE購入: ${totalBe}`);
}

main().catch((err) => {
  console.error('[daily-metrics] エラー:', err);
  process.exit(1);
});
