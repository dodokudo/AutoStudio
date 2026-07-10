import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : null;
})();

const DEFAULT_DATASET = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
const TABLE_NAME = 'lstep_friends_raw';

export const revalidate = 1800;

// 【2026.7】7月セミナーのパネル計測タグ（rawCsvLoader.ts の SEMINAR_2026_7_COLUMNS に対応）
const PANEL_SECTIONS: Array<{ title: string; items: Array<{ column: string; label: string }> }> = [
  {
    title: '登録特典',
    items: [
      { column: 's7_gift_tap', label: '登録特典タップ' },
      { column: 's7_gift_video', label: '登録特典：動画視聴' },
      { column: 's7_gift_guide', label: '登録特典：攻略ガイド' },
      { column: 's7_gift_seminar_apply', label: '登録特典：セミナー申込' },
    ],
  },
  {
    title: 'アンケート誘導',
    items: [
      { column: 's7_survey_start_immediate', label: 'アンケートスタート（登録直後）' },
      { column: 's7_survey_start_h1', label: 'アンケートスタート（1時間後）' },
      { column: 's7_survey_start_d1_night', label: 'アンケートスタート（1日後夜）' },
      { column: 's7_survey_start_d2_morning', label: 'アンケートスタート（2日後朝）' },
      { column: 's7_survey_start_d2_night', label: 'アンケートスタート（2日後夜）' },
      { column: 's7_seminar_survey_answered', label: 'セミナーアンケート回答' },
    ],
  },
  {
    title: '動画LP誘導',
    items: [
      { column: 's7_video_lp_tap_after_survey', label: '動画LPタップ（アンケート回答直後）' },
      { column: 's7_video_lp_tap_h1', label: '動画LPタップ（1時間後）' },
      { column: 's7_video_lp_cta_tap', label: '動画LPのCTAタップ' },
      { column: 's7_material_cta_tap', label: '教材のCTAタップ' },
      { column: 's7_video_watched_total', label: '動画視聴総数' },
    ],
  },
  {
    title: 'セミナーフォーム誘導',
    items: [
      { column: 's7_seminar_form_tap_h1', label: 'フォームタップ（1時間後）' },
      { column: 's7_seminar_form_tap_d1_morning', label: 'フォームタップ（1日後朝）' },
      { column: 's7_seminar_form_tap_d1_night', label: 'フォームタップ（1日後夜）' },
      { column: 's7_seminar_form_tap_d2_morning', label: 'フォームタップ（2日後朝）' },
      { column: 's7_seminar_form_tap_d2_noon', label: 'フォームタップ（2日後昼）' },
      { column: 's7_seminar_form_tap_d2_noon_hw', label: 'フォームタップ（2日後昼・旧）' },
      { column: 's7_seminar_form_tap_d2_night', label: 'フォームタップ（2日後夜）' },
      { column: 's7_seminar_form_tap_d3_night', label: 'フォームタップ（3日後夜）' },
      { column: 's7_seminar_form_tap_d4_morning', label: 'フォームタップ（4日後朝）' },
      { column: 's7_seminar_form_tap_d4_19', label: 'フォームタップ（4日後19時）' },
      { column: 's7_seminar_form_tap_d4_23', label: 'フォームタップ（4日後23時）' },
    ],
  },
  {
    title: 'セミナー申込・参加',
    items: [
      { column: 's7_seminar_applied_total', label: 'セミナー申込総数' },
      { column: 's7_seminar_joined_total', label: 'セミナー参加総数' },
      { column: 's7_seminar_bonus_tap', label: 'セミナー参加特典タップ' },
    ],
  },
  {
    title: '商品LP・購入',
    items: [
      { column: 's7_product_lp_tap_after_seminar', label: '商品LPタップ（セミナー直後）' },
      { column: 's7_product_lp_tap_h1', label: '商品LPタップ（1時間後）' },
      { column: 's7_product_lp_tap_d1_morning', label: '商品LPタップ（1日後朝）' },
      { column: 's7_product_lp_tap_d1_noon', label: '商品LPタップ（1日後昼）' },
      { column: 's7_product_lp_tap_d1_19', label: '商品LPタップ（1日後19時）' },
      { column: 's7_product_lp_tap_d1_23', label: '商品LPタップ（1日後23時）' },
      { column: 's7_product_lp_tap_total', label: '商品LPタップ総数' },
      { column: 's7_achiever_sent', label: '実績者送った' },
      { column: 's7_purchase_button', label: '購入ボタン' },
      { column: 's7_bank_transfer', label: '銀振希望者' },
      { column: 's7_front_purchased_total', label: 'フロント購入者総数' },
    ],
  },
  {
    title: '個別相談',
    items: [
      { column: 's7_consult_tap', label: '個別相談会タップ' },
      { column: 's7_consult_applied', label: '個別相談会申込済み' },
      { column: 's7_consult_joined', label: '個別相談会参加' },
    ],
  },
];

// サマリーファネル（上から順に移行率を計算）
const SUMMARY_STEPS: Array<{ column: string | null; label: string }> = [
  { column: null, label: '有効友だち（計測対象）' },
  { column: 's7_seminar_survey_answered', label: 'アンケート回答' },
  { column: 's7_video_watched_total', label: '動画視聴' },
  { column: 's7_seminar_applied_total', label: 'セミナー申込' },
  { column: 's7_seminar_joined_total', label: 'セミナー参加' },
  { column: 's7_product_lp_tap_total', label: '商品LPタップ' },
  { column: 's7_front_purchased_total', label: 'フロント購入' },
];

export async function GET() {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'BigQuery プロジェクト ID が未設定です' }, { status: 500 });
  }

  try {
    const client = createBigQueryClient(PROJECT_ID, process.env.LSTEP_BQ_LOCATION);

    const allColumns = [
      ...PANEL_SECTIONS.flatMap((s) => s.items.map((i) => i.column)),
    ];
    const uniqueColumns = [...new Set(allColumns)];

    // テーブルに実在するカラムだけをSUM対象にする（CSV形式変更でカラムが欠けてもエラーにしない）
    const [schemaRows] = await client.query({
      query: `
        SELECT column_name
        FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = @tableName AND column_name LIKE 's7_%'
      `,
      params: { tableName: TABLE_NAME },
      useLegacySql: false,
    });
    const existingColumns = new Set(
      (schemaRows as Array<{ column_name: string }>).map((r) => r.column_name),
    );
    const queryColumns = uniqueColumns.filter((col) => existingColumns.has(col));
    const missingColumns = uniqueColumns.filter((col) => !existingColumns.has(col));

    if (queryColumns.length === 0) {
      return NextResponse.json(
        { error: '【2026.7】パネル計測カラム（s7_*）がBigQueryに存在しません。CSV取り込みの設定を確認してください。' },
        { status: 404 },
      );
    }

    const sumExprs = queryColumns
      .map((col) => `SUM(CAST(\`${col}\` AS INT64)) AS \`${col}\``)
      .join(',\n        ');

    const query = `
      WITH latest AS (
        SELECT MAX(snapshot_date) AS sd
        FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\`
      )
      SELECT
        l.sd AS snapshot_date,
        COUNT(DISTINCT CASE WHEN t.blocked = 0 THEN t.id END) AS base,
        ${sumExprs}
      FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\` t
      JOIN latest l ON t.snapshot_date = l.sd
      GROUP BY l.sd
    `;

    const [rows] = await client.query({ query, useLegacySql: false });
    const row = rows[0] as Record<string, unknown> | undefined;

    if (!row) {
      return NextResponse.json({ error: 'データが存在しません' }, { status: 404 });
    }

    const base = Number(row.base ?? 0);
    const getCount = (col: string) => (existingColumns.has(col) ? Number(row[col] ?? 0) : 0);

    const sections = PANEL_SECTIONS.map((section) => ({
      title: section.title,
      items: section.items.map((item) => ({
        label: item.label,
        count: getCount(item.column),
        rate: base > 0 ? (getCount(item.column) / base) * 100 : 0,
        missing: !existingColumns.has(item.column),
      })),
    }));

    let prev = base;
    const summary = SUMMARY_STEPS.map((step, index) => {
      const count = step.column === null ? base : getCount(step.column);
      // 前段が0人の場合は移行率を出さない（タグ運用開始直後は前段が0のことがある）
      const conversionRate = index === 0 || prev <= 0 ? null : (count / prev) * 100;
      const overallRate = base > 0 ? (count / base) * 100 : 0;
      prev = count;
      return { label: step.label, count, conversionRate, overallRate };
    });

    const snapshotDate = (() => {
      const value = row.snapshot_date as { value?: string } | string | undefined;
      if (typeof value === 'string') return value;
      return value?.value ?? null;
    })();

    return NextResponse.json({ snapshotDate, base, summary, sections, missingColumns });
  } catch (error) {
    console.error('[api/line/panel-analysis] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'クエリの実行に失敗しました' },
      { status: 500 },
    );
  }
}
