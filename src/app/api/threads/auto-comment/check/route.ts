import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';

// 特典誘導テンプレート（文言・URLは必要に応じて変更）
const TOKUTEN_GUIDE_URL = 'https://autostudio-self.vercel.app/l/th/2026';
const TOKUTEN_GUIDE_TEMPLATE = `1000名以上が受け取っている2026年最新版のAI×Threadsノウハウはこちら▼
${TOKUTEN_GUIDE_URL}`;

// 投稿の伸び検知条件
const IMPRESSIONS_THRESHOLD = 1000; // インプレッション閾値
const COMMENT_CTR_THRESHOLD = 0.1; // コメント1への遷移率閾値(10%)

// 監視対象期間（当日+前日の2日間）
const MONITORING_DAYS = 2;

interface TriggerCandidate {
  post_id: string;
  impressions: number;
  comment1_views: number;
  comment1_ctr: number;
  trigger_reason: string;
}

interface TokutenCheckResult {
  has_tokuten_guide: boolean;
  reason: string;
}

/**
 * 投稿が伸び検知条件を満たしているかチェック
 */
async function findTriggerCandidates(client: ReturnType<typeof createBigQueryClient>): Promise<TriggerCandidate[]> {
  const query = `
    WITH post_stats AS (
      SELECT
        p.post_id,
        p.impressions_total as impressions,
        p.posted_at,
        -- コメント欄1(depth=0)のviewsを取得
        (
          SELECT SUM(c.views)
          FROM \`${PROJECT_ID}.${DATASET}.threads_comments\` c
          WHERE c.parent_post_id = p.post_id
            AND c.depth = 0
        ) as comment1_views
      FROM \`${PROJECT_ID}.${DATASET}.threads_posts\` p
      WHERE
        -- 監視期間内の投稿のみ
        p.posted_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${MONITORING_DAYS} DAY)
        -- 既に自動コメント済みの投稿は除外
        AND p.post_id NOT IN (
          SELECT post_id FROM \`${PROJECT_ID}.${DATASET}.auto_comment_history\`
          WHERE tokuten_comment_added = TRUE
        )
    )
    SELECT
      post_id,
      impressions,
      IFNULL(comment1_views, 0) as comment1_views,
      CASE
        WHEN impressions > 0 THEN IFNULL(comment1_views, 0) / impressions
        ELSE 0
      END as comment1_ctr,
      'impressions_and_ctr' as trigger_reason
    FROM post_stats
    WHERE
      impressions >= @impressions_threshold
      AND impressions > 0
      AND (IFNULL(comment1_views, 0) / impressions) >= @ctr_threshold
    ORDER BY posted_at DESC
  `;

  const [rows] = await client.query({
    query,
    params: {
      impressions_threshold: IMPRESSIONS_THRESHOLD,
      ctr_threshold: COMMENT_CTR_THRESHOLD,
    },
  });

  return rows as TriggerCandidate[];
}

/**
 * 特典誘導が既に設置されているかチェック
 */
async function checkTokutenGuide(
  client: ReturnType<typeof createBigQueryClient>,
  postId: string
): Promise<TokutenCheckResult> {
  const query = `
    SELECT
      comment_id,
      text,
      depth
    FROM \`${PROJECT_ID}.${DATASET}.threads_comments\`
    WHERE parent_post_id = @post_id
    ORDER BY timestamp ASC
  `;

  const [comments] = await client.query({
    query,
    params: { post_id: postId },
  });

  if (!comments || comments.length === 0) {
    return { has_tokuten_guide: false, reason: 'no_comments' };
  }

  // チェック1: コメント欄2(depth=1)にURLが含まれているか
  const comment2WithUrl = comments.find(
    (c: any) => c.depth === 1 && c.text && c.text.includes('http')
  );

  if (comment2WithUrl) {
    return { has_tokuten_guide: true, reason: 'url_in_comment2' };
  }

  // チェック2: 固定ポスト誘導の文言があるか
  const fixedPostPattern = /固定ポスト.*配.*受け取/;
  const hasFixedPostGuide = comments.some(
    (c: any) => c.text && (
      fixedPostPattern.test(c.text) ||
      c.text.includes('固定ポストで配ってる') ||
      c.text.includes('固定ポストで解説してます')
    )
  );

  if (hasFixedPostGuide) {
    return { has_tokuten_guide: true, reason: 'fixed_post_guide' };
  }

  return { has_tokuten_guide: false, reason: 'no_guide_found' };
}

/**
 * コメント欄2（depth=1）の最後のcomment_idを取得
 */
async function getLastComment2Id(
  client: ReturnType<typeof createBigQueryClient>,
  postId: string
): Promise<string | null> {
  const query = `
    SELECT comment_id
    FROM \`${PROJECT_ID}.${DATASET}.threads_comments\`
    WHERE parent_post_id = @post_id AND depth = 1
    ORDER BY timestamp DESC
    LIMIT 1
  `;
  const [rows] = await client.query({ query, params: { post_id: postId } });
  return rows.length > 0 ? rows[0].comment_id : null;
}

/**
 * コメントスケジュールに追加（コメント欄3 = depth=2 として追加）
 */
async function scheduleComment(
  client: ReturnType<typeof createBigQueryClient>,
  postId: string,
  commentText: string
): Promise<string | null> {
  // コメント欄2のIDを取得（これにリプライしてdepth=2にする）
  const comment2Id = await getLastComment2Id(client, postId);
  if (!comment2Id) {
    console.log(`[auto-comment] No comment2 found for post ${postId}, skipping`);
    return null;
  }

  const scheduleId = `auto_${postId}_${Date.now()}`;
  const planId = `auto_comment_${postId}`;

  const query = `
    INSERT INTO \`${PROJECT_ID}.${DATASET}.comment_schedules\`
    (schedule_id, plan_id, parent_thread_id, comment_order, comment_text, scheduled_time, status, created_at)
    VALUES (@schedule_id, @plan_id, @parent_thread_id, @comment_order, @comment_text, CURRENT_TIMESTAMP(), 'pending', CURRENT_TIMESTAMP())
  `;

  await client.query({
    query,
    params: {
      schedule_id: scheduleId,
      plan_id: planId,
      parent_thread_id: comment2Id, // コメント欄2のIDにリプライ → depth=2になる
      comment_order: 1,
      comment_text: commentText,
    },
  });

  return scheduleId;
}

/**
 * 実行履歴を記録
 */
async function recordHistory(
  client: ReturnType<typeof createBigQueryClient>,
  candidate: TriggerCandidate,
  tokutenCheck: TokutenCheckResult,
  tokutenCommentAdded: boolean
): Promise<void> {
  const query = `
    INSERT INTO \`${PROJECT_ID}.${DATASET}.auto_comment_history\`
    (post_id, triggered_at, trigger_reason, impressions, comment1_ctr, has_tokuten_guide, tokuten_comment_added, note_comment_added, created_at)
    VALUES (@post_id, CURRENT_TIMESTAMP(), @trigger_reason, @impressions, @comment1_ctr, @has_tokuten_guide, @tokuten_comment_added, FALSE, CURRENT_TIMESTAMP())
  `;

  await client.query({
    query,
    params: {
      post_id: candidate.post_id,
      trigger_reason: candidate.trigger_reason,
      impressions: candidate.impressions,
      comment1_ctr: candidate.comment1_ctr,
      has_tokuten_guide: tokutenCheck.has_tokuten_guide,
      tokuten_comment_added: tokutenCommentAdded,
    },
  });
}

export async function POST() {
  try {
    console.log('[threads/auto-comment/check] Starting auto comment check...');

    const client = createBigQueryClient(PROJECT_ID);

    // 1. 伸び検知条件を満たす投稿を取得
    const candidates = await findTriggerCandidates(client);
    console.log(`[threads/auto-comment/check] Found ${candidates.length} trigger candidates`);

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No trigger candidates found',
        processed: 0,
      });
    }

    let processedCount = 0;
    let addedCount = 0;

    for (const candidate of candidates) {
      console.log(`[threads/auto-comment/check] Processing post ${candidate.post_id}...`);
      console.log(`  Impressions: ${candidate.impressions}, Comment1 CTR: ${(candidate.comment1_ctr * 100).toFixed(1)}%`);

      // 2. 特典誘導の有無をチェック
      const tokutenCheck = await checkTokutenGuide(client, candidate.post_id);
      console.log(`  Tokuten guide check: ${tokutenCheck.has_tokuten_guide} (${tokutenCheck.reason})`);

      let tokutenCommentAdded = false;

      // 3. 特典誘導がない場合は追加（コメント欄2の下 = depth=2に追加）
      if (!tokutenCheck.has_tokuten_guide) {
        console.log(`  Adding tokuten guide comment to comment3 (depth=2)...`);
        const scheduleId = await scheduleComment(client, candidate.post_id, TOKUTEN_GUIDE_TEMPLATE);
        if (scheduleId) {
          tokutenCommentAdded = true;
          addedCount++;
        } else {
          console.log(`  Skipped: no comment2 found to reply to`);
        }
      }

      // 4. 実行履歴を記録
      await recordHistory(client, candidate, tokutenCheck, tokutenCommentAdded);
      processedCount++;
    }

    console.log(`[threads/auto-comment/check] Completed: ${processedCount} processed, ${addedCount} comments added`);

    return NextResponse.json({
      success: true,
      processed: processedCount,
      added: addedCount,
      candidates: candidates.map(c => ({
        post_id: c.post_id,
        impressions: c.impressions,
        comment1_ctr: c.comment1_ctr,
        trigger_reason: c.trigger_reason,
      })),
    });
  } catch (error) {
    console.error('[threads/auto-comment/check] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
