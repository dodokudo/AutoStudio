/**
 * sync-tags スタンドアロンスクリプト
 * tag_metricsの最新データをKPIの実績値に自動反映する
 *
 * Usage:
 *   npx tsx src/scripts/syncTagsToKpi.ts [funnelId]
 *
 * デフォルト funnelId: funnel-1770198372071（3月ローンチ）
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { SEGMENT_CUTOFF_DATE } from '@/lib/launch-constants';
import type { LaunchKpi } from '@/types/launch';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
const DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
const KPI_TABLE = `${PROJECT_ID}.${DATASET}.launch_kpi`;
const TAG_TABLE = `${PROJECT_ID}.${DATASET}.tag_metrics`;
const FRIENDS_TABLE = `${PROJECT_ID}.${DATASET}.lstep_friends_raw`;

const DEFAULT_FUNNEL_ID = 'funnel-1770198372071';

interface TagMapping {
  prefix: string;
  field: string;
}

const TAG_MAPPINGS: TagMapping[] = [
  { prefix: '3M:特典受取', field: 'videoViewers.actual' },
  { prefix: '3M:セミナー申込済み', field: 'seminarApplications.actual' },
  { prefix: '3M:セミナー参加', field: 'seminarApplications.attendActual' },
  { prefix: '3M:FE購入', field: 'frontend.actual' },
  { prefix: '3M:BE購入', field: 'backend.actual' },
  { prefix: '3M:Threads投稿流入', field: 'inflow.threads.actual' },
  { prefix: '3M:Threads固定ポスト流入', field: 'inflow.threadsPin.actual' },
  { prefix: '3M:Threadsプロフィール流入', field: 'inflow.threadsProfile.actual' },
  { prefix: '3M:IG流入', field: 'inflow.instagram.actual' },
];

const SEMINAR_DATE_RE = /^3M:(\d{1,2})\/(\d{1,2})\s/;

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

async function main(): Promise<void> {
  const funnelId = process.argv[2] || DEFAULT_FUNNEL_ID;
  console.log(`[sync-tags] funnelId: ${funnelId}`);
  console.log(`[sync-tags] PROJECT_ID: ${PROJECT_ID}, DATASET: ${DATASET}`);

  const bq = createBigQueryClient(PROJECT_ID);

  // 1. 最新タグスナップショット取得
  const [tagRows] = await bq.query({
    query: `
      SELECT tag_name, friend_count, measured_at
      FROM \`${TAG_TABLE}\`
      WHERE measured_at = (
        SELECT MAX(measured_at) FROM \`${TAG_TABLE}\`
      )
    `,
    useLegacySql: false,
  });

  if (!tagRows || tagRows.length === 0) {
    console.error('[sync-tags] タグメトリクスが見つかりません。先にLステップ計測パイプラインを実行してください。');
    process.exit(1);
  }

  console.log(`[sync-tags] タグ行数: ${tagRows.length}`);

  // 2. 現在のKPIデータ取得
  const [kpiRows] = await bq.query({
    query: `SELECT data FROM \`${KPI_TABLE}\` WHERE funnel_id = @funnelId LIMIT 1`,
    useLegacySql: false,
    params: { funnelId },
  });

  if (!kpiRows || kpiRows.length === 0) {
    console.error('[sync-tags] KPIデータが見つかりません。先にKPI設定を保存してください。');
    process.exit(1);
  }

  const currentKpi: LaunchKpi = JSON.parse((kpiRows[0] as { data: string }).data);

  // 3. タグ→KPIマッピング適用
  const updates: Record<string, number> = {};
  let threadsTotal = 0;

  for (const row of tagRows) {
    const tagName = (row as { tag_name: string }).tag_name;
    const count = (row as { friend_count: number }).friend_count;

    for (const mapping of TAG_MAPPINGS) {
      if (tagName.startsWith(mapping.prefix)) {
        if (mapping.field.startsWith('inflow.threads')) {
          threadsTotal += count;
        } else {
          updates[mapping.field] = count;
        }
        break;
      }
    }

    const dateMatch = tagName.match(SEMINAR_DATE_RE);
    if (dateMatch) {
      const month = dateMatch[1].padStart(2, '0');
      const day = dateMatch[2].padStart(2, '0');
      const dateStr = `2026-${month}-${day}`;
      const seminarDay = currentKpi.seminarDays?.find((s) => s.date === dateStr);
      if (seminarDay) {
        seminarDay.recruitActual = count;
      }
    }
  }

  if (threadsTotal > 0) {
    updates['inflow.threads.actual'] = threadsTotal;
  }

  // 3.5 LINE登録数をlstep_friends_rawから取得
  try {
    const cutoff = SEGMENT_CUTOFF_DATE;
    if (cutoff && currentKpi.lineRegistration) {
      const [friendsRows] = await bq.query({
        query: `
          WITH latest AS (
            SELECT MAX(snapshot_date) AS sd
            FROM \`${FRIENDS_TABLE}\`
          )
          SELECT
            COUNTIF(DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") < @cutoff) AS existing_count,
            COUNTIF(DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") >= @cutoff) AS new_count
          FROM \`${FRIENDS_TABLE}\` f
          JOIN latest l ON f.snapshot_date = l.sd
          WHERE f.friend_added_at IS NOT NULL
            AND f.blocked = 0
        `,
        useLegacySql: false,
        params: { cutoff },
      });

      if (friendsRows && friendsRows.length > 0) {
        const r = friendsRows[0] as { existing_count: number; new_count: number };
        updates['lineRegistration.newActual'] = Number(r.new_count);
        console.log(`[sync-tags] LINE登録数: 既存=${r.existing_count}, 新規=${r.new_count}`);
      }
    }
  } catch (e) {
    console.error('[sync-tags] LINE登録数取得エラー:', e);
  }

  // 3.6 過去セミナー日のattendActual/purchaseCountを募集比率で配分
  const totalAttend = updates['seminarApplications.attendActual'] ?? 0;
  const totalPurchase = updates['frontend.actual'] ?? 0;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  if (currentKpi.seminarDays && (totalAttend > 0 || totalPurchase > 0)) {
    // 過去日のrecruitActualの合計を計算
    const pastDays = currentKpi.seminarDays.filter((s) => s.date <= today);
    const totalPastRecruit = pastDays.reduce((sum, s) => sum + (s.recruitActual ?? 0), 0);

    if (totalPastRecruit > 0) {
      let attendRemaining = totalAttend;
      let purchaseRemaining = totalPurchase;

      for (let i = 0; i < pastDays.length; i++) {
        const day = pastDays[i];
        const recruit = day.recruitActual ?? 0;
        const isLast = i === pastDays.length - 1;

        if (isLast) {
          // 最後の日に残り全部を割り当て（端数吸収）
          day.attendActual = attendRemaining;
          day.purchaseCount = purchaseRemaining;
        } else {
          const ratio = recruit / totalPastRecruit;
          const attendShare = Math.round(totalAttend * ratio);
          const purchaseShare = Math.round(totalPurchase * ratio);
          day.attendActual = attendShare;
          day.purchaseCount = purchaseShare;
          attendRemaining -= attendShare;
          purchaseRemaining -= purchaseShare;
        }
        console.log(`[sync-tags] ${day.date}: attend=${day.attendActual}, purchase=${day.purchaseCount} (recruit=${recruit})`);
      }
    }
  }

  // 4. KPIオブジェクトに反映
  const kpiObj = currentKpi as unknown as Record<string, unknown>;
  for (const [path, value] of Object.entries(updates)) {
    setNestedValue(kpiObj, path, value);
  }

  // 5. 保存（DELETE + INSERT）
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

  // 6. 検証
  const [verifyRows] = await bq.query({
    query: `SELECT data FROM \`${KPI_TABLE}\` WHERE funnel_id = @funnelId LIMIT 1`,
    useLegacySql: false,
    params: { funnelId },
  });

  if (!verifyRows || verifyRows.length === 0) {
    console.error('[sync-tags] 検証失敗: KPIデータが保存されていません');
    process.exit(1);
  }

  const measuredAt = (tagRows[0] as { measured_at: { value: string } }).measured_at?.value
    || (tagRows[0] as { measured_at: string }).measured_at;

  console.log('[sync-tags] 完了');
  console.log(`  更新フィールド: ${Object.keys(updates).join(', ') || '(なし)'}`);
  console.log(`  タグ数: ${tagRows.length}`);
  console.log(`  計測日時: ${measuredAt}`);
  for (const [field, value] of Object.entries(updates)) {
    console.log(`  ${field}: ${value}`);
  }
}

main().catch((err) => {
  console.error('[sync-tags] エラー:', err);
  process.exit(1);
});
