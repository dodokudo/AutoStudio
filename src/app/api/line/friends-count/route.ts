import { NextResponse } from 'next/server';
import { resolveProjectId, createBigQueryClient } from '@/lib/bigquery';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : null;
})();

const DATASET_ID = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
const TABLE_NAME = 'lstep_friends_raw';

/**
 * GET /api/line/friends-count?cutoff=2026-03-08
 *
 * lstep_friends_raw の最新スナップショットから既存/新規のブロック除外済み有効友だち数を返す
 */
export async function GET(request: Request) {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const cutoff = searchParams.get('cutoff');

  if (!cutoff || !/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    return NextResponse.json({ error: 'cutoff parameter is required (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const client = createBigQueryClient(PROJECT_ID, process.env.LSTEP_BQ_LOCATION);

    // BQテーブルの実際のカラム名:
    // 3m_lp = 3M:動画LP遷移, 3m_done = 3M:セミナー申込済み,
    // 3m_fe = 3M:FE購入, 3m_be = 3M:BE購入
    const [rows] = await client.query({
      query: `
        WITH latest AS (
          SELECT MAX(snapshot_date) AS sd
          FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_NAME}\`
        )
        SELECT
          COUNTIF(DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") < @cutoff) AS existing_count,
          COUNTIF(DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") >= @cutoff) AS new_count,
          COUNT(*) AS total_count,
          -- 3Mタグ: 全体
          COUNTIF(\`3m_lp\` = 1) AS video_total,
          COUNTIF(\`3m_done\` = 1) AS seminar_applied_total,
          CAST(NULL AS INT64) AS seminar_joined_total, -- tag_metricsから別途取得
          COUNTIF(\`3m_fe\` = 1) AS fe_purchased_total,
          COUNTIF(\`3m_be\` = 1) AS be_purchased_total,
          -- 3Mタグ: 既存
          COUNTIF(\`3m_lp\` = 1 AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") < @cutoff) AS video_existing,
          COUNTIF(\`3m_done\` = 1 AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") < @cutoff) AS seminar_applied_existing,
          CAST(NULL AS INT64) AS seminar_joined_existing,
          COUNTIF(\`3m_fe\` = 1 AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") < @cutoff) AS fe_purchased_existing,
          COUNTIF(\`3m_be\` = 1 AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") < @cutoff) AS be_purchased_existing,
          -- 3Mタグ: 新規
          COUNTIF(\`3m_lp\` = 1 AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") >= @cutoff) AS video_new,
          COUNTIF(\`3m_done\` = 1 AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") >= @cutoff) AS seminar_applied_new,
          CAST(NULL AS INT64) AS seminar_joined_new,
          COUNTIF(\`3m_fe\` = 1 AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") >= @cutoff) AS fe_purchased_new,
          COUNTIF(\`3m_be\` = 1 AND DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") >= @cutoff) AS be_purchased_new
        FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_NAME}\` t
        JOIN latest l ON t.snapshot_date = l.sd
        WHERE t.friend_added_at IS NOT NULL
          AND t.blocked = 0
      `,
      params: { cutoff },
    });

    const r = rows[0] ?? {};
    const toNum = (v: unknown) => Number(v ?? 0);

    // tag_metricsから「3M:セミナー参加」の最新値を取得
    // タグが存在しない場合はnull（KpiDashboardのfallbackに委ねる）、存在して0ならそのまま0
    let seminarJoinedTotal: number | null = null;
    try {
      const [tagRows] = await client.query({
        query: `
          SELECT friend_count
          FROM \`${PROJECT_ID}.${DATASET_ID}.tag_metrics\`
          WHERE tag_name LIKE '3M:セミナー参加%'
          ORDER BY measured_at DESC
          LIMIT 1
        `,
      });
      if (tagRows && tagRows.length > 0) {
        seminarJoinedTotal = Number((tagRows[0] as { friend_count: number }).friend_count);
      }
    } catch (e) {
      console.error('[api/line/friends-count] tag_metrics query error:', e);
    }

    return NextResponse.json({
      existing: toNum(r.existing_count),
      new: toNum(r.new_count),
      total: toNum(r.total_count),
      cutoff,
      steps: {
        video:           { total: toNum(r.video_total),            existing: toNum(r.video_existing),            new: toNum(r.video_new) },
        seminarApplied:  { total: toNum(r.seminar_applied_total),  existing: toNum(r.seminar_applied_existing),  new: toNum(r.seminar_applied_new) },
        seminarJoined:   { total: seminarJoinedTotal,              existing: null,                                new: null },
        fePurchased:     { total: toNum(r.fe_purchased_total),     existing: toNum(r.fe_purchased_existing),     new: toNum(r.fe_purchased_new) },
        bePurchased:     { total: toNum(r.be_purchased_total),     existing: toNum(r.be_purchased_existing),     new: toNum(r.be_purchased_new) },
      },
    });
  } catch (error) {
    console.error('[api/line/friends-count] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to count friends' },
      { status: 500 },
    );
  }
}
