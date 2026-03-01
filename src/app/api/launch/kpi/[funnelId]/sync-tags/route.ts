import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import type { LaunchKpi } from '@/types/launch';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
const DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
const KPI_TABLE = `${PROJECT_ID}.${DATASET}.launch_kpi`;
const TAG_TABLE = `${PROJECT_ID}.${DATASET}.tag_metrics`;

/**
 * タグ名 → KPIフィールドのマッピング定義
 * tag_metricsのtag_nameには【追加時】等のアクション記述が付く場合があるため、
 * startsWith でマッチする
 */
interface TagMapping {
  prefix: string;
  field: keyof LaunchKpi | string; // ドット区切りパス
}

const TAG_MAPPINGS: TagMapping[] = [
  // ファネルステップ
  { prefix: '3M:特典受取', field: 'videoViewers.actual' },
  { prefix: '3M:セミナー申込済み', field: 'seminarApplications.actual' },
  { prefix: '3M:セミナー参加', field: 'seminarApplications.attendActual' },
  { prefix: '3M:FE購入', field: 'frontend.actual' },
  { prefix: '3M:BE購入', field: 'backend.actual' },
  // 流入チャネル
  { prefix: '3M:Threads投稿流入', field: 'inflow.threads.actual' },
  { prefix: '3M:Threads固定ポスト流入', field: 'inflow.threadsPin.actual' },
  { prefix: '3M:Threadsプロフィール流入', field: 'inflow.threadsProfile.actual' },
  { prefix: '3M:IG流入', field: 'inflow.instagram.actual' },
];

/** セミナー日付タグのプレフィックスパターン: "3M:3/14" */
const SEMINAR_DATE_RE = /^3M:(\d{1,2})\/(\d{1,2})\s/;

/**
 * ドット区切りのパスでオブジェクトの値をセット
 */
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

/**
 * POST: Lステップのタグメトリクスから最新の実績値をKPIに反映
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ funnelId: string }> },
) {
  try {
    const { funnelId } = await params;

    if (!funnelId) {
      return NextResponse.json({ error: 'funnelId is required' }, { status: 400 });
    }

    const bq = createBigQueryClient(PROJECT_ID);

    // 1. 最新のタグスナップショットを取得（各タグの最新measured_at行）
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
      return NextResponse.json(
        { error: 'タグメトリクスが見つかりません。先にLステップ計測パイプラインを実行してください。' },
        { status: 404 },
      );
    }

    // 2. 現在のKPIデータを取得
    let currentKpi: LaunchKpi | null = null;
    try {
      const [kpiRows] = await bq.query({
        query: `SELECT data FROM \`${KPI_TABLE}\` WHERE funnel_id = @funnelId LIMIT 1`,
        useLegacySql: false,
        params: { funnelId },
      });
      if (kpiRows && kpiRows.length > 0) {
        currentKpi = JSON.parse((kpiRows[0] as { data: string }).data);
      }
    } catch {
      // テーブルが無い場合はnullのまま
    }

    if (!currentKpi) {
      return NextResponse.json(
        { error: 'KPIデータが見つかりません。先にKPI設定を保存してください。' },
        { status: 404 },
      );
    }

    // 3. タグ→KPIマッピングを適用
    const updates: Record<string, number> = {};
    // Threads流入の合算用
    let threadsTotal = 0;

    for (const row of tagRows) {
      const tagName = (row as { tag_name: string }).tag_name;
      const count = (row as { friend_count: number }).friend_count;

      // 通常マッピング
      for (const mapping of TAG_MAPPINGS) {
        if (tagName.startsWith(mapping.prefix)) {
          // Threads系は合算
          if (mapping.field.startsWith('inflow.threads')) {
            threadsTotal += count;
          } else {
            updates[mapping.field] = count;
          }
          break;
        }
      }

      // セミナー日付タグ: "3M:3/14 【追加時】..." → seminarDaysの該当日のrecruitActual
      const dateMatch = tagName.match(SEMINAR_DATE_RE);
      if (dateMatch) {
        const month = dateMatch[1].padStart(2, '0');
        const day = dateMatch[2].padStart(2, '0');
        const dateStr = `2026-${month}-${day}`; // 年は3月ローンチなので2026固定
        const seminarDay = currentKpi.seminarDays?.find((s) => s.date === dateStr);
        if (seminarDay) {
          seminarDay.recruitActual = count;
        }
      }
    }

    // Threads流入を合算してセット
    if (threadsTotal > 0) {
      updates['inflow.threads.actual'] = threadsTotal;
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

    // 最新計測日時
    const measuredAt = (tagRows[0] as { measured_at: { value: string } }).measured_at?.value
      || (tagRows[0] as { measured_at: string }).measured_at;

    return NextResponse.json({
      success: true,
      updatedFields: Object.keys(updates),
      tagCount: tagRows.length,
      measuredAt,
    });
  } catch (error) {
    console.error('Failed to sync tags to KPI:', error);
    return NextResponse.json({ error: 'Failed to sync tags' }, { status: 500 });
  }
}
