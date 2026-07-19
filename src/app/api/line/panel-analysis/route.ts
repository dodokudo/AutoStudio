import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : null;
})();

const DEFAULT_DATASET = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
const TABLE_NAME = 'lstep_friends_raw';
const TARGET_START_DATE = '2026-07-03';

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
  { column: null, label: '計測対象（7/3以降LINE登録）' },
  { column: 'survey_completed', label: '回答完了' },
  { column: 's7_video_watched_total', label: '動画視聴' },
  { column: 'applied_by_info', label: 'セミナー申込' },
  { column: 's7_seminar_joined_total', label: 'セミナー参加' },
  { column: 's7_product_lp_tap_total', label: '商品LPタップ' },
  { column: 's7_front_purchased_total', label: 'フロント購入' },
];

const SEMINAR_SLOT_COLUMN = 'seminar_application_slot';

// 申込判定は友だち情報「セミナー申込日」を正とする（タグではなく友だち情報で確定させる運用ルール）
const APPLIED_SQL = `TRIM(COALESCE(seminar_application_slot, '')) != ''`;

// セミナー枠は固定テンプレートを持たず、選択期間の実データに存在する枠から組み立てる
// （枠を増減しても、期間を切り替えても、表示が実態に追従する）
// ただし今回のローンチは 7/8 開催分から。6月の枠は前ローンチなので混ぜない。
const SEMINAR_SLOT_FIRST_MONTH = 7;
const SEMINAR_SLOT_FIRST_DAY = 8;

const DEMOGRAPHIC_GROUPS = [
  {
    key: 'age',
    label: '年代',
    items: [
      { key: 'age20', column: '20s', label: '20代' },
      { key: 'age30', column: '30s', label: '30代' },
      { key: 'age40', column: '40s', label: '40代' },
      { key: 'age50', column: '50s', label: '50代' },
      { key: 'age60', column: '60s', label: '60代' },
    ],
  },
  {
    key: 'job',
    label: '職業',
    items: [
      { key: 'employee', column: 'job_employee', label: '会社員' },
      { key: 'freelance', column: 'job_freelance', label: 'フリーランス' },
      { key: 'businessOwner', column: 'job_business_owner', label: '経営者' },
      { key: 'housewife', column: 'job_housewife', label: '主婦' },
      { key: 'student', column: 'job_student', label: '学生' },
    ],
  },
  {
    key: 'revenue',
    label: '月商',
    items: [
      { key: 'r0', column: 'revenue_m0yen', label: '0円' },
      { key: 'r1to10', column: 'revenue_m1to10man', label: '1〜10万円' },
      { key: 'r10to50', column: 'revenue_m10to50man', label: '10〜50万円' },
      { key: 'r50to100', column: 'revenue_m50to100man', label: '50〜100万円' },
      { key: 'r100to500', column: 'revenue_m100to500man', label: '100〜500万円' },
      { key: 'r500to1000', column: 'revenue_m500to1000man', label: '500〜1000万円' },
      { key: 'r1000over', column: 'revenue_m1000manover', label: '1000万円以上' },
    ],
  },
  {
    key: 'goal',
    label: '目標',
    items: [
      { key: 'g10', column: 'goal_m10manover', label: '10万円以上' },
      { key: 'g50', column: 'goal_m50manover', label: '50万円以上' },
      { key: 'g100', column: 'goal_m100manover', label: '100万円以上' },
      { key: 'g300', column: 'goal_m300manover', label: '300万円以上' },
      { key: 'g500', column: 'goal_m500manover', label: '500万円以上' },
      { key: 'g1000', column: 'goal_m1000manover', label: '1000万円以上' },
    ],
  },
  {
    key: 'source',
    label: '流入',
    items: [
      { key: 'threads', column: 'source_threads', label: 'Threads' },
      { key: 'instagram', column: 'source_instagram', label: 'Instagram' },
      { key: 'youtube', column: 'source_youtube', label: 'YouTube' },
      { key: 'ad', column: 'inflow_ad', label: '広告' },
      { key: 'organic', column: 'inflow_organic', label: 'OG' },
    ],
  },
];

const buildDemographicSegments = (appliedSql: string) => [
  { key: 'applicants', label: 'セミナー申込者', condition: appliedSql },
  { key: 'attendees', label: 'セミナー参加者', condition: 'COALESCE(s7_seminar_joined_total, 0) = 1' },
  { key: 'purchasers', label: '購入者', condition: 'COALESCE(s7_front_purchased_total, 0) = 1' },
];

const toNumber = (value: unknown) => Number(value ?? 0);

const toDateString = (value: unknown) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'value' in value) return String(value.value);
  return String(value);
};

const getRate = (count: number, base: number) => (base > 0 ? (count / base) * 100 : 0);

const parseSeminarSlot = (slot: string) => {
  const monthDay = slot.match(/(\d{1,2})月(\d{1,2})日/) ?? slot.match(/(\d{1,2})\/(\d{1,2})/);
  // 時刻は13時/21時に限定しない（20時開催などの枠を取りこぼさないため）
  const hour = slot.match(/(\d{1,2})(?::00|時)/);
  if (!monthDay || !hour) return null;

  const month = Number(monthDay[1]);
  const day = Number(monthDay[2]);
  const hourValue = Number(hour[1]);
  return {
    key: `${month}-${day}-${hourValue}`,
    date: `${month}/${day}`,
    time: `${hourValue}時`,
    month,
    day,
    hour: hourValue,
  };
};

const SOURCE_LABEL_SQL = `
  CASE
    WHEN TRIM(COALESCE(inflow_source, '')) != '' THEN TRIM(inflow_source)
    WHEN yamazaki = 1 THEN '山崎'
    WHEN source_threads = 1 OR source_threads_post = 1 OR source_threads_profile = 1 OR source_threads_fixed = 1 THEN 'Threads'
    WHEN source_instagram = 1 OR source_instagram_profile = 1 OR source_instagram_comment = 1 THEN 'Instagram'
    WHEN source_youtube = 1 THEN 'YouTube'
    WHEN inflow_ad = 1 THEN '広告'
    WHEN inflow_organic = 1 THEN 'OG'
    ELSE '未設定'
  END
`;

type PanelPayload = Record<string, unknown> & { error?: string; status?: number };

async function computePanelAnalysis(targetStartDate: string, targetEndDate: string): Promise<PanelPayload> {
  if (!PROJECT_ID) {
    return { error: 'BigQuery プロジェクト ID が未設定です', status: 500 };
  }
  const queryParams = { targetStartDate, targetEndDate };
  {
    const client = createBigQueryClient(PROJECT_ID, process.env.LSTEP_BQ_LOCATION);

    const metricColumns = [
      ...PANEL_SECTIONS.flatMap((s) => s.items.map((i) => i.column)),
      ...SUMMARY_STEPS.map((s) => s.column).filter((col): col is string => Boolean(col)),
    ];
    const demographicColumns = DEMOGRAPHIC_GROUPS.flatMap((group) => group.items.map((item) => item.column));
    const allColumns = [...new Set([...metricColumns, ...demographicColumns, SEMINAR_SLOT_COLUMN])];

    const [schemaRows] = await client.query({
      query: `
        SELECT column_name
        FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = @tableName AND column_name IN UNNEST(@columnNames)
      `,
      params: { tableName: TABLE_NAME, columnNames: allColumns },
      useLegacySql: false,
    });
    const existingColumns = new Set(
      (schemaRows as Array<{ column_name: string }>).map((r) => r.column_name),
    );
    const queryColumns = [...new Set(metricColumns)]
      .filter((col) => col !== 'applied_by_info')
      .filter((col) => existingColumns.has(col));
    const missingColumns = [...new Set(metricColumns)]
      .filter((col) => col !== 'applied_by_info')
      .filter((col) => !existingColumns.has(col));

    // 友だち情報「セミナー申込日」列が無い場合はタグ判定にフォールバック
    const appliedSql = existingColumns.has(SEMINAR_SLOT_COLUMN)
      ? APPLIED_SQL
      : 'COALESCE(s7_seminar_applied_total, 0) = 1';
    const DEMOGRAPHIC_SEGMENTS = buildDemographicSegments(appliedSql);

    if (queryColumns.length === 0) {
      return { error: '【2026.7】パネル計測カラム（s7_*）がBigQueryに存在しません。CSV取り込みの設定を確認してください。', status: 404 };
    }

    const sumExprs = queryColumns
      .map((col) => `SUM(CAST(\`${col}\` AS INT64)) AS \`${col}\``)
      .join(',\n        ');
    const segmentTotalExprs = DEMOGRAPHIC_SEGMENTS
      .map((segment) => `COUNTIF(${segment.condition}) AS ${segment.key}_total`)
      .join(',\n        ');
    const demographicExprs = DEMOGRAPHIC_SEGMENTS.flatMap((segment) =>
      DEMOGRAPHIC_GROUPS.flatMap((group) =>
        group.items
          .filter((item) => existingColumns.has(item.column))
          .map((item) => (
            `COUNTIF(${segment.condition} AND \`${item.column}\` = 1) AS ${segment.key}_${group.key}_${item.key}`
          )),
      ),
    ).join(',\n        ');

    const query = `
      WITH latest AS (
        SELECT MAX(snapshot_date) AS sd
        FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\`
      ),
      target AS (
        SELECT t.*
        FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\` t
        JOIN latest l ON t.snapshot_date = l.sd
        WHERE t.friend_added_at IS NOT NULL
          AND DATE(TIMESTAMP(t.friend_added_at), 'Asia/Tokyo') BETWEEN DATE(@targetStartDate) AND DATE(@targetEndDate)
      )
      SELECT
        (SELECT sd FROM latest) AS snapshot_date,
        COUNT(DISTINCT id) AS base,
        COUNT(DISTINCT CASE WHEN blocked = 0 THEN id END) AS active_base,
        COUNT(DISTINCT CASE WHEN blocked = 1 THEN id END) AS blocked_count,
        COUNTIF(${appliedSql}) AS applied_by_info,
        COUNTIF(blocked = 0 AND COALESCE(s7_front_purchased_total, 0) = 1) AS state_purchased,
        COUNTIF(blocked = 0 AND COALESCE(s7_front_purchased_total, 0) != 1 AND COALESCE(s7_seminar_joined_total, 0) = 1) AS state_attended_not_purchased,
        COUNTIF(blocked = 0 AND COALESCE(s7_front_purchased_total, 0) != 1 AND COALESCE(s7_seminar_joined_total, 0) != 1 AND (${appliedSql})) AS state_applied_not_attended,
        COUNTIF(blocked = 0 AND COALESCE(s7_front_purchased_total, 0) != 1 AND COALESCE(s7_seminar_joined_total, 0) != 1 AND NOT (${appliedSql}) AND COALESCE(survey_completed, 0) = 1) AS state_answered_not_applied,
        COUNTIF(blocked = 0 AND COALESCE(s7_front_purchased_total, 0) != 1 AND COALESCE(s7_seminar_joined_total, 0) != 1 AND NOT (${appliedSql}) AND COALESCE(survey_completed, 0) != 1) AS state_not_answered,
        ${sumExprs},
        ${segmentTotalExprs}${demographicExprs ? `,
        ${demographicExprs}` : ''}
      FROM target
    `;

    const [rows] = await client.query({
      query,
      params: queryParams,
      useLegacySql: false,
    });
    const row = rows[0] as Record<string, unknown> | undefined;

    if (!row) {
      return { error: 'データが存在しません', status: 404 };
    }

    const base = toNumber(row.base);
    const activeBase = toNumber(row.active_base);
    const blockedCount = toNumber(row.blocked_count);
    const getCount = (col: string) => (existingColumns.has(col) ? toNumber(row[col]) : 0);

    const surveyCompleted = getCount('survey_completed');
    const seminarApplied = toNumber(row.applied_by_info);
    const seminarJoined = getCount('s7_seminar_joined_total');
    const purchased = getCount('s7_front_purchased_total');
    const consultTapped = getCount('s7_consult_tap');
    const consultApplied = getCount('s7_consult_applied');
    const consultJoined = getCount('s7_consult_joined');
    const productLpTapped = getCount('s7_product_lp_tap_total');

    const sections = PANEL_SECTIONS.map((section) => ({
      title: section.title,
      items: section.items.map((item) => ({
        label: item.label,
        count: getCount(item.column),
        rate: getRate(getCount(item.column), base),
        missing: !existingColumns.has(item.column),
      })),
    }));

    let prev = base;
    const summary = SUMMARY_STEPS.map((step, index) => {
      const count = step.column === null
        ? base
        : step.column === 'applied_by_info'
          ? seminarApplied
          : getCount(step.column);
      const conversionRate = index === 0 || prev <= 0 ? null : getRate(count, prev);
      const overallRate = getRate(count, base);
      prev = count;
      return { label: step.label, count, conversionRate, overallRate };
    });

    const report = {
      targetStartDate,
      base,
      activeBase,
      blockedCount,
      blockedRate: getRate(blockedCount, base),
      surveyCompleted,
      seminarApplied,
      seminarApplicationRate: getRate(seminarApplied, surveyCompleted),
      seminarJoined,
      seminarJoinRate: getRate(seminarJoined, seminarApplied),
      purchased,
      purchaseRate: getRate(purchased, seminarJoined),
      productLpTapped,
      consultTapped,
      consultApplied,
      consultJoined,
    };

    const branchStats = [
      {
        label: 'セミナー申込あり',
        count: seminarApplied,
        baseLabel: '回答完了',
        baseCount: surveyCompleted,
        rate: getRate(seminarApplied, surveyCompleted),
      },
      {
        label: 'セミナー申込なし',
        count: Math.max(surveyCompleted - seminarApplied, 0),
        baseLabel: '回答完了',
        baseCount: surveyCompleted,
        rate: getRate(Math.max(surveyCompleted - seminarApplied, 0), surveyCompleted),
      },
      {
        label: '申込後に参加',
        count: seminarJoined,
        baseLabel: 'セミナー申込',
        baseCount: seminarApplied,
        rate: getRate(seminarJoined, seminarApplied),
      },
      {
        label: '参加後に未購入',
        count: Math.max(seminarJoined - purchased, 0),
        baseLabel: 'セミナー参加',
        baseCount: seminarJoined,
        rate: getRate(Math.max(seminarJoined - purchased, 0), seminarJoined),
      },
      {
        label: '個別相談申込',
        count: consultApplied,
        baseLabel: '未購入/未申込追撃',
        baseCount: Math.max(base - purchased, 0),
        rate: getRate(consultApplied, Math.max(base - purchased, 0)),
      },
    ];

    const slotRows = existingColumns.has(SEMINAR_SLOT_COLUMN)
      ? await client.query({
        query: `
          WITH latest AS (
            SELECT MAX(snapshot_date) AS sd
            FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\`
          ),
          target AS (
            SELECT t.*
            FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\` t
            JOIN latest l ON t.snapshot_date = l.sd
            WHERE t.friend_added_at IS NOT NULL
              AND DATE(TIMESTAMP(t.friend_added_at), 'Asia/Tokyo') BETWEEN DATE(@targetStartDate) AND DATE(@targetEndDate)
          )
          SELECT
            TRIM(CAST(\`${SEMINAR_SLOT_COLUMN}\` AS STRING)) AS seminar_slot,
            COUNT(DISTINCT id) AS applications,
            COUNTIF(s7_seminar_joined_total = 1) AS joined,
            COUNTIF(s7_front_purchased_total = 1) AS purchased
          FROM target
          WHERE TRIM(CAST(\`${SEMINAR_SLOT_COLUMN}\` AS STRING)) != ''
          GROUP BY seminar_slot
        `,
        params: queryParams,
        useLegacySql: false,
      }).then(([result]) => result as Array<Record<string, unknown>>)
      : [];

    type SlotAccumulator = {
      key: string;
      date: string;
      time: string;
      month: number;
      day: number;
      hour: number;
      applications: number;
      joined: number;
      purchased: number;
      rawSlots: string[];
    };
    const slotMap = new Map<string, SlotAccumulator>();
    for (const slotRow of slotRows) {
      const rawSlot = String(slotRow.seminar_slot ?? '');
      const parsed = parseSeminarSlot(rawSlot);
      if (!parsed) continue;
      const current = slotMap.get(parsed.key) ?? {
        key: parsed.key,
        date: parsed.date,
        time: parsed.time,
        month: parsed.month,
        day: parsed.day,
        hour: parsed.hour,
        applications: 0,
        joined: 0,
        purchased: 0,
        rawSlots: [] as string[],
      };
      current.applications += toNumber(slotRow.applications);
      current.joined += toNumber(slotRow.joined);
      current.purchased += toNumber(slotRow.purchased);
      current.rawSlots.push(rawSlot);
      slotMap.set(parsed.key, current);
    }

    const seminarSlots = [...slotMap.values()]
      .filter(
        (slot) =>
          slot.month > SEMINAR_SLOT_FIRST_MONTH ||
          (slot.month === SEMINAR_SLOT_FIRST_MONTH && slot.day >= SEMINAR_SLOT_FIRST_DAY),
      )
      .sort((a, b) => a.month - b.month || a.day - b.day || a.hour - b.hour)
      .map((slot) => ({
        key: slot.key,
        date: slot.date,
        time: slot.time,
        applications: slot.applications,
        joined: slot.joined,
        purchased: slot.purchased,
        joinRate: getRate(slot.joined, slot.applications),
        purchaseRate: getRate(slot.purchased, slot.joined),
        rawSlots: slot.rawSlots,
      }));

    // 状態マップ: 全員を必ず1つの状態に割り当てる（ブロック以外の各状態＝リマーケ在庫）
    const nowMs = Date.now();
    const slotYear = Number(TARGET_START_DATE.slice(0, 4));
    const slotTimeMs = (slot: { date: string; time: string }) => {
      const [m, d] = slot.date.split('/').map(Number);
      const hour = Number(slot.time.replace('時', ''));
      return new Date(
        `${slotYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+09:00`,
      ).getTime();
    };
    const PURCHASE_WINDOW_MS = 48 * 60 * 60 * 1000;
    let expiredNotAttended = 0;
    let purchaseWindowExpired = 0;
    for (const slot of seminarSlots) {
      const t = slotTimeMs(slot);
      if (t < nowMs) expiredNotAttended += Math.max(slot.applications - slot.joined, 0);
      if (t + PURCHASE_WINDOW_MS < nowMs) purchaseWindowExpired += Math.max(slot.joined - slot.purchased, 0);
    }

    const stateMap = [
      { key: 'not_answered', label: '未回答', count: toNumber(row.state_not_answered), next: 'アンケート誘導の継続', alert: 0, alertLabel: '' },
      { key: 'answered_not_applied', label: '回答済み・未申込', count: toNumber(row.state_answered_not_applied), next: '個別相談誘導 / リマーケ販売', alert: 0, alertLabel: '' },
      { key: 'applied_not_attended', label: '申込済み・未参加', count: toNumber(row.state_applied_not_attended), next: '後追い配信', alert: expiredNotAttended, alertLabel: '枠日時を過ぎた' },
      { key: 'attended_not_purchased', label: '参加済み・未購入', count: toNumber(row.state_attended_not_purchased), next: '24時間追撃 / 個別相談誘導', alert: purchaseWindowExpired, alertLabel: '参加から48時間超過' },
      { key: 'purchased', label: '購入', count: toNumber(row.state_purchased), next: '', alert: 0, alertLabel: '' },
      { key: 'blocked', label: 'ブロック', count: blockedCount, next: '', alert: 0, alertLabel: '' },
    ];

    const demographicSegments = DEMOGRAPHIC_SEGMENTS.map((segment) => {
      const total = toNumber(row[`${segment.key}_total`]);
      return {
        key: segment.key,
        label: segment.label,
        total,
        groups: DEMOGRAPHIC_GROUPS.map((group) => ({
          key: group.key,
          label: group.label,
          items: group.items
            .filter((item) => existingColumns.has(item.column))
            .map((item) => {
              const count = toNumber(row[`${segment.key}_${group.key}_${item.key}`]);
              return { key: item.key, label: item.label, count, rate: getRate(count, total) };
            })
            .filter((item) => item.count > 0),
        })).filter((group) => group.items.length > 0),
      };
    });

    const blockTimingRows = await client.query({
      query: `
        WITH latest AS (
          SELECT MAX(snapshot_date) AS sd
          FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\`
        ),
        target AS (
          SELECT t.id, DATE(TIMESTAMP(t.friend_added_at), 'Asia/Tokyo') AS joined_date
          FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\` t
          JOIN latest l ON t.snapshot_date = l.sd
          WHERE t.blocked = 1
            AND t.friend_added_at IS NOT NULL
            AND DATE(TIMESTAMP(t.friend_added_at), 'Asia/Tokyo') BETWEEN DATE(@targetStartDate) AND DATE(@targetEndDate)
        ),
        first_block AS (
          -- 日次スナップショットが残る user_core で「初めてblockedが観測された日」を推定する
          SELECT CAST(user_id AS STRING) AS user_id, MIN(snapshot_date) AS blocked_date
          FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.user_core\`
          WHERE blocked
          GROUP BY user_id
        )
        SELECT
          CASE
            WHEN DATE_DIFF(first_block.blocked_date, target.joined_date, DAY) <= 0 THEN '登録当日'
            WHEN DATE_DIFF(first_block.blocked_date, target.joined_date, DAY) = 1 THEN '1日後'
            WHEN DATE_DIFF(first_block.blocked_date, target.joined_date, DAY) = 2 THEN '2日後'
            WHEN DATE_DIFF(first_block.blocked_date, target.joined_date, DAY) = 3 THEN '3日後'
            WHEN DATE_DIFF(first_block.blocked_date, target.joined_date, DAY) = 4 THEN '4日後'
            ELSE '5日後以降'
          END AS label,
          COUNT(*) AS count
        FROM target
        JOIN first_block ON first_block.user_id = CAST(target.id AS STRING)
        GROUP BY label
      `,
      params: queryParams,
      useLegacySql: false,
    }).then(([result]) => result as Array<Record<string, unknown>>);

    const blockTimingOrder = ['登録当日', '1日後', '2日後', '3日後', '4日後', '5日後以降'];
    const blockTimingMap = new Map(blockTimingRows.map((blockRow) => [String(blockRow.label), toNumber(blockRow.count)]));
    const blockTiming = blockTimingOrder.map((label) => {
      const count = blockTimingMap.get(label) ?? 0;
      return { label, count, rate: getRate(count, blockedCount) };
    });

    // 登録日別コホート: いつ登録した人が、今どこまで進んでいるか（最新スナップショットから登録日で集計）
    const dailyMovementRows = await client.query({
      query: `
        WITH latest AS (
          SELECT MAX(snapshot_date) AS sd
          FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\`
        )
        SELECT
          FORMAT_DATE('%Y-%m-%d', DATE(TIMESTAMP(t.friend_added_at), 'Asia/Tokyo')) AS date,
          COUNT(DISTINCT t.id) AS registered,
          COUNTIF(COALESCE(t.survey_completed, 0) = 1) AS answered,
          COUNTIF(${appliedSql.replace(/seminar_application_slot/g, 't.seminar_application_slot').replace(/s7_seminar_applied_total/g, 't.s7_seminar_applied_total')}) AS applied,
          COUNTIF(COALESCE(t.s7_seminar_joined_total, 0) = 1) AS joined,
          COUNTIF(COALESCE(t.s7_front_purchased_total, 0) = 1) AS purchased,
          COUNTIF(t.blocked = 1) AS blocked
        FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\` t
        JOIN latest l ON t.snapshot_date = l.sd
        WHERE t.friend_added_at IS NOT NULL
          AND DATE(TIMESTAMP(t.friend_added_at), 'Asia/Tokyo') BETWEEN DATE(@targetStartDate) AND DATE(@targetEndDate)
        GROUP BY date
        ORDER BY date DESC
      `,
      params: queryParams,
      useLegacySql: false,
    }).then(([result]) => result as Array<Record<string, unknown>>);

    const dailyMovements = dailyMovementRows.map((m) => ({
      date: String(m.date),
      registered: toNumber(m.registered),
      answered: toNumber(m.answered),
      applied: toNumber(m.applied),
      joined: toNumber(m.joined),
      purchased: toNumber(m.purchased),
      blocked: toNumber(m.blocked),
    }));

    // リードタイム分析: 登録から回答/申込/参加/購入まで何日かかっているか
    const leadTimeRows = await client.query({
      query: `
        WITH latest AS (
          SELECT MAX(snapshot_date) AS sd
          FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\`
        ),
        target AS (
          SELECT t.*
          FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\` t
          JOIN latest l ON t.snapshot_date = l.sd
          WHERE t.friend_added_at IS NOT NULL
            AND DATE(TIMESTAMP(t.friend_added_at), 'Asia/Tokyo') BETWEEN DATE(@targetStartDate) AND DATE(@targetEndDate)
        ),
        info_first AS (
          SELECT user_id, MIN(snapshot_date) AS first_seen
          FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.user_info\`
          WHERE field_name = 'セミナー申込日' AND TRIM(field_value) != ''
          GROUP BY user_id
        ),
        info_start AS (
          SELECT MIN(first_seen) AS field_start FROM info_first
        ),
        diffs AS (
          SELECT 'answered' AS metric,
            DATE_DIFF(survey_answered_date, DATE(TIMESTAMP(friend_added_at), 'Asia/Tokyo'), DAY) AS d
          FROM target
          WHERE survey_answered_date IS NOT NULL

          UNION ALL
          -- 申込の実行日はLステップに記録がないため推定する。
          -- 申込は必ず「登録日〜申込枠の開催日」の間に起きるので、
          -- 「日次データの初観測日」と「枠の開催日」の早い方を申込日とみなす（実際はこれより早い場合あり）
          SELECT 'applied',
            DATE_DIFF(
              LEAST(
                f.first_seen,
                COALESCE(
                  SAFE.DATE(2026,
                    CAST(REGEXP_EXTRACT(TRIM(t.seminar_application_slot), r'^(\\d{1,2})') AS INT64),
                    CAST(REGEXP_EXTRACT(TRIM(t.seminar_application_slot), r'^\\d{1,2}[/月](\\d{1,2})') AS INT64)),
                  f.first_seen)
              ),
              DATE(TIMESTAMP(t.friend_added_at), 'Asia/Tokyo'), DAY)
          FROM target t
          JOIN info_first f ON f.user_id = CAST(t.id AS STRING)
          WHERE TRIM(COALESCE(t.seminar_application_slot, '')) != ''

          UNION ALL
          -- 参加日 = 申込した枠の開催日から算出
          SELECT 'joined',
            DATE_DIFF(
              DATE(2026,
                CAST(REGEXP_EXTRACT(TRIM(seminar_application_slot), r'^(\\d{1,2})') AS INT64),
                CAST(REGEXP_EXTRACT(TRIM(seminar_application_slot), r'^\\d{1,2}[/月](\\d{1,2})') AS INT64)),
              DATE(TIMESTAMP(friend_added_at), 'Asia/Tokyo'), DAY)
          FROM target
          WHERE COALESCE(s7_seminar_joined_total, 0) = 1
            AND REGEXP_CONTAINS(TRIM(COALESCE(seminar_application_slot, '')), r'^\\d{1,2}[/月]\\d{1,2}')

          UNION ALL
          SELECT 'purchased',
            DATE_DIFF(front_purchased_date, DATE(TIMESTAMP(friend_added_at), 'Asia/Tokyo'), DAY)
          FROM target
          WHERE front_purchased_date IS NOT NULL
        )
        SELECT
          metric,
          CASE
            WHEN d IS NULL THEN 'unknown'
            WHEN d <= 0 THEN 'd0'
            WHEN d = 1 THEN 'd1'
            WHEN d = 2 THEN 'd2'
            WHEN d = 3 THEN 'd3'
            WHEN d BETWEEN 4 AND 7 THEN 'd4_7'
            ELSE 'd8p'
          END AS bucket,
          COUNT(*) AS c,
          AVG(d) AS avg_days
        FROM diffs
        GROUP BY metric, bucket
      `,
      params: queryParams,
      useLegacySql: false,
    }).then(([result]) => result as Array<Record<string, unknown>>);

    const LEAD_METRICS = [
      { key: 'answered', label: 'アンケート回答' },
      { key: 'applied', label: 'セミナー申込' },
      { key: 'joined', label: 'セミナー参加' },
      { key: 'purchased', label: '購入' },
    ];
    const leadTime = LEAD_METRICS.map((metric) => {
      const rows = leadTimeRows.filter((r) => String(r.metric) === metric.key);
      const buckets: Record<string, number> = { d0: 0, d1: 0, d2: 0, d3: 0, d4_7: 0, d8p: 0, unknown: 0 };
      let weighted = 0;
      let known = 0;
      for (const r of rows) {
        const bucket = String(r.bucket);
        const c = toNumber(r.c);
        buckets[bucket] = (buckets[bucket] ?? 0) + c;
        if (bucket !== 'unknown') {
          weighted += toNumber(r.avg_days) * c;
          known += c;
        }
      }
      return {
        key: metric.key,
        label: metric.label,
        buckets,
        total: Object.values(buckets).reduce((sum, v) => sum + v, 0),
        avgDays: known > 0 ? weighted / known : null,
      };
    });

    const sourceRows = await client.query({
      query: `
        WITH latest AS (
          SELECT MAX(snapshot_date) AS sd
          FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\`
        ),
        target AS (
          SELECT t.*
          FROM \`${PROJECT_ID}.${DEFAULT_DATASET}.${TABLE_NAME}\` t
          JOIN latest l ON t.snapshot_date = l.sd
          WHERE t.friend_added_at IS NOT NULL
            AND DATE(TIMESTAMP(t.friend_added_at), 'Asia/Tokyo') BETWEEN DATE(@targetStartDate) AND DATE(@targetEndDate)
        )
        SELECT
          ${SOURCE_LABEL_SQL} AS label,
          COUNT(DISTINCT id) AS base,
          COUNTIF(survey_completed = 1) AS survey_completed,
          COUNTIF(${appliedSql}) AS seminar_applied,
          COUNTIF(s7_seminar_joined_total = 1) AS seminar_joined,
          COUNTIF(s7_front_purchased_total = 1) AS purchased,
          COUNTIF(blocked = 1) AS blocked
        FROM target
        GROUP BY label
        ORDER BY base DESC, label
      `,
      params: queryParams,
      useLegacySql: false,
    }).then(([result]) => result as Array<Record<string, unknown>>);

    const sourceAnalysis = sourceRows.map((sourceRow) => {
      const sourceBase = toNumber(sourceRow.base);
      const sourceSurveyCompleted = toNumber(sourceRow.survey_completed);
      const sourceSeminarApplied = toNumber(sourceRow.seminar_applied);
      const sourceSeminarJoined = toNumber(sourceRow.seminar_joined);
      const sourcePurchased = toNumber(sourceRow.purchased);
      const sourceBlocked = toNumber(sourceRow.blocked);
      return {
        label: String(sourceRow.label ?? '未設定'),
        base: sourceBase,
        surveyCompleted: sourceSurveyCompleted,
        seminarApplied: sourceSeminarApplied,
        seminarApplicationRate: getRate(sourceSeminarApplied, sourceSurveyCompleted),
        seminarJoined: sourceSeminarJoined,
        seminarJoinRate: getRate(sourceSeminarJoined, sourceSeminarApplied),
        purchased: sourcePurchased,
        purchaseRate: getRate(sourcePurchased, sourceSeminarJoined),
        blocked: sourceBlocked,
        blockedRate: getRate(sourceBlocked, sourceBase),
      };
    });

    const snapshotDate = toDateString(row.snapshot_date);

    return {
      snapshotDate,
      base,
      report,
      stateMap,
      dailyMovements,
      leadTime,
      branchStats,
      seminarSlots,
      demographicSegments,
      blockTiming,
      sourceAnalysis,
      summary,
      sections,
      missingColumns,
    };
  }
}

// BigQueryへの重いクエリ群を30分キャッシュする（メインタブと同じ更新頻度）
const computePanelAnalysisCached = unstable_cache(
  computePanelAnalysis,
  ['line-panel-analysis-v1'],
  { revalidate: 1800 },
);

export async function GET(request: Request) {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'BigQuery プロジェクト ID が未設定です' }, { status: 500 });
  }

  // 期間フィルタ（?start=YYYY-MM-DD&end=YYYY-MM-DD）。未指定時はローンチ開始日〜現在
  const url = new URL(request.url);
  const isDateParam = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  const startParam = url.searchParams.get('start');
  const endParam = url.searchParams.get('end');
  // このファネルの計測開始は TARGET_START_DATE。「今月」「過去30日」など
  // それより前に遡る期間を選ばれても、前ローンチのデータが混ざらないよう開始日で打ち止める。
  const requestedStartDate = isDateParam(startParam) ? startParam : TARGET_START_DATE;
  const targetStartDate = requestedStartDate < TARGET_START_DATE ? TARGET_START_DATE : requestedStartDate;
  const targetEndDate = isDateParam(endParam) ? endParam : '2099-12-31';

  try {
    const result = await computePanelAnalysisCached(targetStartDate, targetEndDate);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/line/panel-analysis] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'クエリの実行に失敗しました' },
      { status: 500 },
    );
  }
}
