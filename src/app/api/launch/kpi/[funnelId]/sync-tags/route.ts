import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import type { LaunchKpi } from '@/types/launch';

const PROJECT_ID = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
const DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
const KPI_TABLE = `${PROJECT_ID}.${DATASET}.launch_kpi`;
const TAG_TABLE = `${PROJECT_ID}.${DATASET}.tag_metrics`;
const FRIENDS_TABLE = `${PROJECT_ID}.${DATASET}.lstep_friends_raw`;

/**
 * タグ名 → KPIフィールドのマッピング定義
 * tag_metricsのtag_nameには【追加時】等のアクション記述が付く場合があるため、
 * startsWith でマッチし、同一fieldは最大値を採用する
 */
interface TagMapping {
  prefix: string;
  field: string; // ドット区切りパス
}

const TAG_MAPPINGS: TagMapping[] = [
  // ファネルステップ（tag_metricsの実際のタグ名に合わせる）
  { prefix: '3M:動画LP遷移', field: 'videoViewers.actual' },
  { prefix: '3M:セミナー申込済み', field: 'seminarApplications.actual' },
  { prefix: '3M:セミナーフォーム遷移', field: 'seminarApplications.formVisits' },
  { prefix: '3M:セミナー参加', field: 'seminarApplications.attendActual' },
  { prefix: '3M:FE購入', field: 'frontend.actual' },
  { prefix: '3M:BE購入', field: 'backend.actual' },
  // 流入チャネル（個別タグを合算）
  { prefix: '3M:Threads投稿流入', field: '_threads_sub' },
  { prefix: '3M:Threads固定ポスト流入', field: '_threads_sub' },
  { prefix: '3M:Threadsプロフィール流入', field: '_threads_sub' },
  { prefix: '3M:流入', field: '_threads_total' }, // 全体流入数（合算ではなくこちらが正）
  { prefix: '3M:IG流入', field: 'inflow.instagram.actual' },
  // 動画視聴
  { prefix: '3M:動画視聴', field: 'videoViewers.watchActual' },
  // 特典
  { prefix: '3M:特典　電子書籍', field: 'videoViewers.ebookActual' },
  { prefix: '3M:電子書籍閲覧', field: 'videoViewers.ebookViewActual' },
  // エンゲージメント
  { prefix: '3M:アンケート回答済み', field: 'videoViewers.surveyActual' },
  { prefix: '3M:事前反応', field: 'videoViewers.preEngageActual' },
];

/** セミナー日付タグ: "3M:3/14" or "3M:3/14 【追加時】..." */
const SEMINAR_DATE_RE = /^3M:(\d{1,2})\/(\d{1,2})(\s|$)/;

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
 * POST: Lステップのタグメトリクス + 友だちデータから最新の実績値をKPIに反映
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
        SELECT tag_name, friend_count
        FROM \`${TAG_TABLE}\`
        QUALIFY ROW_NUMBER() OVER (PARTITION BY tag_name ORDER BY measured_at DESC) = 1
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

    // 後方互換: benefitReceivers → videoViewers
    if ((currentKpi as unknown as Record<string, unknown>).benefitReceivers && !currentKpi.videoViewers) {
      currentKpi.videoViewers = (currentKpi as unknown as Record<string, unknown>).benefitReceivers as LaunchKpi['videoViewers'];
      delete (currentKpi as unknown as Record<string, unknown>).benefitReceivers;
    }

    // 3. タグ→KPIマッピングを適用
    const updates: Record<string, number> = {};
    let threadsSubTotal = 0;
    let threadsTotal = 0;
    const seminarDateCounts: Record<string, number> = {};

    for (const row of tagRows) {
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
            // 同一fieldは最大値を採用（タグバリアント対策）
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

    // Threads流入: 3M:流入タグがあればそちらを優先、なければサブ合算
    const threadsActual = threadsTotal > 0 ? threadsTotal : threadsSubTotal;
    if (threadsActual > 0) {
      updates['inflow.threads.actual'] = threadsActual;
    }

    // 4. LINE登録数をlstep_friends_rawから取得
    try {
      const { SEGMENT_CUTOFF_DATE } = await import('@/lib/launch-constants');
      const cutoff = currentKpi.lineRegistration
        ? SEGMENT_CUTOFF_DATE
        : null;

      if (cutoff) {
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
          // existing は手動設定値なので上書きしない（ローンチ開始時点のスナップショット）
          updates['lineRegistration.newActual'] = Number(r.new_count);
        }
      }
    } catch (e) {
      console.error('[sync-tags] Failed to fetch friends count:', e);
      // 友だち数の取得失敗はタグ同期を止めない
    }

    // 5. セミナー日付のrecruitActual反映
    for (const [dateStr, count] of Object.entries(seminarDateCounts)) {
      const seminarDay = currentKpi.seminarDays?.find((s) => s.date === dateStr);
      if (seminarDay) {
        seminarDay.recruitActual = count;
      }
    }

    // 6. KPIオブジェクトに反映
    const kpiObj = currentKpi as unknown as Record<string, unknown>;
    for (const [path, value] of Object.entries(updates)) {
      setNestedValue(kpiObj, path, value);
    }

    // 7. 保存（DELETE + INSERT）
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

    return NextResponse.json({
      success: true,
      updatedFields: Object.keys(updates),
      seminarDates: seminarDateCounts,
      tagCount: tagRows.length,
    });
  } catch (error) {
    console.error('Failed to sync tags to KPI:', error);
    return NextResponse.json({ error: 'Failed to sync tags' }, { status: 500 });
  }
}
