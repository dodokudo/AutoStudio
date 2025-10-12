import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from './bigquery';
import { sanitizeThreadsComment, sanitizeThreadsMainPost } from './threadsText';
import type {
  PromptAccountSummary,
  PromptSelfPost,
  PromptCompetitorHighlight,
  PromptTrendingTopic,
  PromptTemplateSummary,
  ThreadsPromptPayload,
  PromptSelfPostBreakdown,
  PromptCompetitorStructure,
  PromptWritingChecklist,
  CompetitorPost,
  OwnPost,
  MonguchiPost,
} from '../types/prompt';

interface BuildPromptOptions {
  projectId: string;
  referenceDate?: string;
  rangeDays?: number;
  startDate?: string;
  endDate?: string;
}

const DATASET = 'autostudio_threads';

const AI_KEYWORDS = ['ai', 'chatgpt', 'claude', 'llm', '自動化', '生成ai', 'gpt', 'midjourney'];
const MAX_CURATED_POSTS = 5;
const MAX_COMPETITOR_STRUCTURES = 5;

const WRITING_CHECKLIST: PromptWritingChecklist = {
  enforcedTheme: 'AI活用に関する実践的なTipsと体験談のみ',
  aiKeywords: ['AI', '生成AI', 'ChatGPT', 'Claude', '自動化', 'LLM'],
  reminders: [
    '関西弁トーンを必ず3箇所以上に散りばめる',
    '冒頭3秒で具体的な数値とインパクトを提示',
    'メイン投稿150-200文字、コメントは400-600文字を目安に',
    'コメント1は体験談＋HowTo、コメント2は応用・注意喚起・行動促進',
    '「AI以外のテーマ」は扱わない。競合例は構文だけ参考にする',
  ],
};

function toPlainString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const inner = (value as Record<string, unknown>).value;
    return typeof inner === 'string' ? inner : null;
  }
  return String(value);
}

async function runQuery<T = Record<string, unknown>>(
  client: BigQuery,
  sql: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const [rows] = await client.query({ query: sql, params });
  return rows as T[];
}

async function fetchAccountSummary(
  client: BigQuery,
  projectId: string,
  rangeDays: number,
  startDate: string,
  endDate: string,
): Promise<PromptAccountSummary> {
  const sql = `
    WITH recent AS (
      SELECT date, followers_snapshot, profile_views
      FROM \`${projectId}.${DATASET}.threads_daily_metrics\`
      WHERE date BETWEEN @startDate AND @endDate
      ORDER BY date DESC
      LIMIT @rangeDays
    ),
    stats AS (
      SELECT
        MAX(followers_snapshot) AS max_followers,
        SUM(profile_views) AS total_profile_views,
        AVG(profile_views) AS avg_profile_views,
        MAX(IF(date = (SELECT MAX(date) FROM recent), followers_snapshot, NULL)) AS latest_followers,
        MAX(IF(date = (SELECT MIN(date) FROM recent), followers_snapshot, NULL)) AS earliest_followers,
        MAX(IF(date = (SELECT MAX(date) FROM recent), profile_views, NULL)) AS latest_views,
        MAX(IF(date = (SELECT MIN(date) FROM recent), profile_views, NULL)) AS earliest_views
      FROM recent
    )
    SELECT
      max_followers,
      total_profile_views,
      avg_profile_views,
      latest_followers - earliest_followers AS followers_change,
      latest_views - earliest_views AS profile_views_change,
      ARRAY(SELECT date FROM recent ORDER BY date) AS dates
    FROM stats
  `;

  type Row = {
    max_followers: number | null;
    total_profile_views: number | null;
    avg_profile_views: number | null;
    followers_change: number | null;
    profile_views_change: number | null;
    dates: string[];
  };
  const rows = await runQuery<Row>(client, sql, {
    startDate,
    endDate,
    rangeDays,
  });
  if (!rows.length) {
    return {
      averageFollowers: 0,
      averageProfileViews: 0,
      totalProfileViews: 0,
      followersChange: 0,
      profileViewsChange: 0,
      recentDates: [],
    };
  }

  const row = rows[0];
  return {
    averageFollowers: Math.round(row.max_followers ?? 0),
    averageProfileViews: Math.round(row.avg_profile_views ?? 0),
    totalProfileViews: Math.round(row.total_profile_views ?? 0),
    followersChange: Math.round(row.followers_change ?? 0),
    profileViewsChange: Math.round(row.profile_views_change ?? 0),
    recentDates: (row.dates ?? []).map((d: unknown) => toPlainString(d) ?? '').filter(Boolean),
  };
}

async function fetchTopSelfPosts(
  client: BigQuery,
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<PromptSelfPost[]> {
  const sql = `
    SELECT post_id, posted_at, content, impressions_total, likes_total, permalink
    FROM \`${projectId}.${DATASET}.threads_posts\`
    WHERE posted_at IS NOT NULL
      AND DATE(posted_at) BETWEEN @startDate AND @endDate
    ORDER BY impressions_total DESC
    LIMIT 10
  `;
  type Row = {
    post_id?: string;
    posted_at?: string;
    content?: string;
    impressions_total?: number;
    likes_total?: number;
    permalink?: string;
  };
  const rows = await runQuery<Row>(client, sql, { startDate, endDate });
  return rows.map((row) => ({
    postId: row.post_id ?? '',
    postedAt: toPlainString(row.posted_at) ?? null,
    impressions: Number(row.impressions_total ?? 0),
    likes: Number(row.likes_total ?? 0),
    content: row.content ?? '',
    permalink: row.permalink ?? '',
  }));
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([!?.,。！？、])/g, '$1')
    .trim();
}

function splitContentIntoMainAndComments(content: string): { mainPost: string; comments: string[] } {
  const segments = content
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { mainPost: sanitizeThreadsMainPost(content.trim()), comments: [] };
  }

  const mainPostRaw = segments[0] ?? '';
  const commentCandidates = segments.slice(1);
  const comments: string[] = [];

  for (const candidate of commentCandidates) {
    if (!candidate) continue;
    if (comments.length >= 2) break;
    const sanitizedComment = sanitizeThreadsComment(candidate);
    if (sanitizedComment) {
      comments.push(sanitizedComment);
    }
  }

  return {
    mainPost: sanitizeThreadsMainPost(mainPostRaw),
    comments,
  };
}

function isAiFocused(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return AI_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function curateSelfPosts(posts: PromptSelfPost[]): PromptSelfPostBreakdown[] {
  const aiPosts = posts.filter((post) => isAiFocused(post.content));
  const target = aiPosts.length ? aiPosts : posts;

  return target.slice(0, MAX_CURATED_POSTS).map((post) => {
    const { mainPost, comments } = splitContentIntoMainAndComments(post.content);
    return {
      postId: post.postId,
      impressions: post.impressions,
      likes: post.likes,
      mainPost: normalizeWhitespace(mainPost),
      comments: comments.map(normalizeWhitespace),
      permalink: post.permalink,
    } satisfies PromptSelfPostBreakdown;
  });
}

function summarizeStructure(snippet: string): string {
  const lines = snippet.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return '短文インサイト';

  const hasBullets = lines.some((line) => /^[・\-*]/.test(line));
  const hasNumbers = lines.some((line) => /^\d+\./.test(line));
  const hasQuestions = snippet.includes('？') || snippet.includes('?');
  const hasSteps = /ステップ|手順|STEP/i.test(snippet);

  const fragments: string[] = [];
  if (hasNumbers || hasSteps) fragments.push('段階説明');
  if (hasBullets) fragments.push('箇条書き');
  if (hasQuestions) fragments.push('疑問投げかけ');
  if (snippet.length > 180) fragments.push('長文解説');
  if (!fragments.length) fragments.push('短文提示');

  return fragments.join(' / ');
}

function buildCompetitorStructures(highlights: PromptCompetitorHighlight[]): PromptCompetitorStructure[] {
  return highlights
    .slice(0, MAX_COMPETITOR_STRUCTURES)
    .map((item) => ({
      accountName: item.accountName,
      username: item.username,
      structureSummary: summarizeStructure(item.contentSnippet),
      example: item.contentSnippet,
    }));
}

async function fetchCompetitorHighlights(
  client: BigQuery,
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<PromptCompetitorHighlight[]> {
  const sql = `
    SELECT account_name, username, post_date, content, impressions, likes
    FROM \`${projectId}.${DATASET}.competitor_posts_raw\`
    WHERE post_date IS NOT NULL
      AND DATE(post_date) BETWEEN @startDate AND @endDate
    ORDER BY impressions DESC NULLS LAST
    LIMIT 5
  `;
  type Row = {
    account_name?: string;
    username?: string;
    post_date?: string;
    content?: string;
    impressions?: number | null;
    likes?: number | null;
  };
  const rows = await runQuery<Row>(client, sql, { startDate, endDate });
  return rows.map((row) => ({
    accountName: row.account_name ?? 'unknown',
    username: row.username ?? null,
    impressions: row.impressions ?? null,
    likes: row.likes ?? null,
    postDate: toPlainString(row.post_date) ?? null,
    contentSnippet: (row.content ?? '').slice(0, 280),
  }));
}

async function fetchPostCount(client: BigQuery, projectId: string, startDate: string, endDate: string): Promise<number> {
  const sql = `
    SELECT COUNT(1) AS total
    FROM \`${projectId}.${DATASET}.threads_posts\`
    WHERE posted_at IS NOT NULL
      AND DATE(posted_at) BETWEEN @startDate AND @endDate
  `;
  type Row = { total?: number };
  const rows = await runQuery<Row>(client, sql, { startDate, endDate });
  return Number(rows[0]?.total ?? 0);
}

async function fetchTrendingTopics(
  client: BigQuery,
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<PromptTrendingTopic[]> {
  const sql = `
    WITH recent AS (
      SELECT *
      FROM \`${projectId}.${DATASET}.competitor_account_daily\`
      WHERE date BETWEEN @startDate AND @endDate
    ),
    enriched AS (
      SELECT account_name, COALESCE(username, account_name) AS uname, COALESCE(genre, 'その他') AS genre,
             date, followers_delta, views
      FROM recent
    ),
    grouped AS (
      SELECT
        genre AS theme_tag,
        AVG(followers_delta) AS avg_followers_delta,
        AVG(views) AS avg_views,
        ARRAY_AGG(DISTINCT uname LIMIT 5) AS accounts
      FROM enriched
      GROUP BY genre
    ),
    positives AS (
      SELECT * FROM grouped WHERE avg_followers_delta >= 0 ORDER BY avg_followers_delta DESC LIMIT 3
    ),
    negatives AS (
      SELECT * FROM grouped WHERE avg_followers_delta < 0 ORDER BY avg_followers_delta ASC LIMIT 3
    )
    SELECT * FROM positives
    UNION ALL
    SELECT * FROM negatives
  `;
  type Row = {
    theme_tag?: string;
    avg_followers_delta?: number;
    avg_views?: number;
    accounts?: string[];
  };
  const rows = await runQuery<Row>(client, sql, { startDate, endDate });
  return rows.map((row) => ({
    themeTag: row.theme_tag ?? 'その他',
    avgFollowersDelta: Number(row.avg_followers_delta ?? 0),
    avgViews: Number(row.avg_views ?? 0),
    sampleAccounts: row.accounts ?? [],
  }));
}

async function fetchTemplateSummaries(client: BigQuery, projectId: string): Promise<PromptTemplateSummary[]> {
  const sql = `
    WITH all_plans AS (
      SELECT
        plan_id,
        template_id,
        TRIM(REGEXP_REPLACE(main_text, r'\\n+', ' ')) AS main_text_normalized,
        generation_date,
        scheduled_time,
        status
      FROM \`${projectId}.${DATASET}.thread_post_plans\`
      WHERE main_text IS NOT NULL
        AND LENGTH(TRIM(main_text)) > 0
    ),
    posts_with_insights AS (
      SELECT
        post_id,
        posted_at,
        content,
        TRIM(REGEXP_REPLACE(REGEXP_REPLACE(content, r'【[^】]+】', ''), r'\\n+', ' ')) AS clean_content,
        impressions_total,
        likes_total
      FROM \`${projectId}.${DATASET}.threads_posts\`
      WHERE posted_at IS NOT NULL
        AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), posted_at, HOUR) <= 48
    ),
    matched_raw AS (
      SELECT
        posts.post_id,
        posts.posted_at,
        posts.impressions_total,
        posts.likes_total,
        plans.template_id,
        ROW_NUMBER() OVER (PARTITION BY posts.post_id ORDER BY plans.generation_date DESC) as rn
      FROM posts_with_insights posts
      LEFT JOIN all_plans plans
        ON STARTS_WITH(posts.clean_content, SUBSTR(plans.main_text_normalized, 1, 40))
    ),
    matched AS (
      SELECT
        post_id,
        posted_at,
        impressions_total,
        likes_total,
        COALESCE(template_id, 'no_template') AS template_id
      FROM matched_raw
      WHERE rn = 1
    ),
    template_stats AS (
      SELECT
        template_id,
        COUNT(*) AS post_count,
        AVG(impressions_total) AS impression_avg48h,
        AVG(likes_total) AS like_avg48h,
        MAX(posted_at) AS latest_post_at
      FROM matched
      GROUP BY template_id
      HAVING COUNT(*) > 0
    )
    SELECT
      template_id,
      post_count,
      impression_avg48h,
      like_avg48h,
      CASE
        WHEN impression_avg48h >= 5000 THEN 'active'
        WHEN impression_avg48h >= 2000 THEN 'candidate'
        ELSE 'needs_review'
      END AS status,
      CASE
        WHEN template_id = 'no_template' THEN '直接投稿（テンプレート無し）'
        ELSE CONCAT(FORMAT('%d投稿', CAST(post_count AS INT64)), ' / 48時間平均パフォーマンス')
      END AS structure_notes
    FROM template_stats
    ORDER BY impression_avg48h DESC
    LIMIT 10
  `;
  type Row = {
    template_id?: string;
    post_count?: number;
    impression_avg48h?: number;
    like_avg48h?: number;
    status?: string;
    structure_notes?: string;
  };
  const rows = await runQuery<Row>(client, sql);
  return rows.map((row) => ({
    templateId: row.template_id ?? 'unknown',
    version: 1,
    status: row.status ?? 'active',
    impressionAvg72h: row.impression_avg48h ?? undefined,
    likeAvg72h: row.like_avg48h ?? undefined,
    structureNotes: row.structure_notes ?? undefined,
  }));
}

async function fetchCompetitorSelected(
  client: BigQuery,
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<CompetitorPost[]> {
  const sql = `
WITH max_post AS (
  SELECT MAX(DATE(post_date)) AS latest_date
  FROM \`${projectId}.${DATASET}.competitor_posts_raw\`
),
latest_genre AS (
  SELECT
    username,
    ARRAY_AGG(STRUCT(date, genre) ORDER BY date DESC LIMIT 1)[OFFSET(0)].genre AS genre
  FROM \`${projectId}.${DATASET}.competitor_account_daily\`
  GROUP BY username
),
daily AS (
  SELECT
    username,
    date AS daily_date,
    followers,
    CASE
      WHEN LAG(followers) OVER (PARTITION BY username ORDER BY date) IS NULL THEN 0
      WHEN LAG(followers) OVER (PARTITION BY username ORDER BY date) = 0 THEN 0
      ELSE followers - LAG(followers) OVER (PARTITION BY username ORDER BY date)
    END AS followers_delta
  FROM \`${projectId}.${DATASET}.competitor_account_daily\`
  WHERE followers > 0
    AND username != 'akagami0124'
),
joined AS (
  SELECT
    p.account_name,
    p.username,
    DATE(p.post_date) AS post_date,
    p.content,
    p.impressions,
    p.likes,
    g.genre,
    d.followers,
    d.followers_delta,
    CASE
      WHEN g.genre IN ('AI', 'AI活用', 'AI活用/自動化', 'ChatGPT', 'Claude', 'LLM', '生成AI') AND p.impressions >= 10000 THEN "pattern_win"
      WHEN g.genre IN ('AI', 'AI活用', 'AI活用/自動化', 'ChatGPT', 'Claude', 'LLM', '生成AI') AND p.impressions >= 5000 THEN "pattern_niche_hit"
      WHEN p.impressions >= 30000 AND d.followers_delta >= 40 THEN "pattern_win"
      WHEN p.impressions >= 30000 AND d.followers_delta BETWEEN 15 AND 39 THEN "pattern_niche_hit"
      WHEN p.impressions BETWEEN 10000 AND 29999 AND d.followers_delta >= 15 THEN "pattern_niche_hit"
      WHEN p.impressions < 30000 AND d.followers_delta >= 40 THEN "pattern_hidden_gem"
      WHEN p.impressions >= 10000 AND d.followers_delta < 15 THEN "pattern_buzz_only"
      ELSE "pattern_fail"
    END AS evaluation,
    CASE
      WHEN g.genre IN ('AI', 'AI活用', 'AI活用/自動化', 'ChatGPT', 'Claude', 'LLM', '生成AI') AND p.impressions >= 30000 THEN "tier_S"
      WHEN g.genre IN ('AI', 'AI活用', 'AI活用/自動化', 'ChatGPT', 'Claude', 'LLM', '生成AI') AND p.impressions >= 15000 THEN "tier_A"
      WHEN g.genre IN ('AI', 'AI活用', 'AI活用/自動化', 'ChatGPT', 'Claude', 'LLM', '生成AI') AND p.impressions >= 5000 THEN "tier_B"
      WHEN p.impressions >= 30000 AND d.followers_delta >= 100 THEN "tier_S"
      WHEN (p.impressions >= 20000 AND d.followers_delta >= 50)
           OR (p.impressions < 20000 AND d.followers_delta >= 80) THEN "tier_A"
      WHEN p.impressions >= 20000 AND d.followers_delta >= 30 THEN "tier_B"
      ELSE "tier_C"
    END AS tier,
    CASE
      WHEN g.genre IN ('AI', 'AI活用', 'AI活用/自動化', 'ChatGPT', 'Claude', 'LLM', '生成AI')
        THEN (p.impressions / 100.0)
      ELSE (d.followers_delta * 12.0) + (p.impressions / 2000.0)
    END AS score
  FROM \`${projectId}.${DATASET}.competitor_posts_raw\` p
  CROSS JOIN max_post m
  LEFT JOIN latest_genre g ON p.username = g.username
  LEFT JOIN daily d ON p.username = d.username AND DATE(p.post_date) = d.daily_date
  WHERE DATE(p.post_date) BETWEEN DATE_SUB(m.latest_date, INTERVAL 30 DAY) AND m.latest_date
    AND p.username != 'akagami0124'
),
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY tier, username ORDER BY score DESC) AS rn
  FROM joined
  WHERE evaluation IN ("pattern_win","pattern_niche_hit","pattern_hidden_gem")
),
filtered AS (
  SELECT * FROM ranked WHERE rn <= 2
),
s_pool AS (
  SELECT * FROM filtered WHERE tier = 'tier_S' ORDER BY score DESC
),
a_pool AS (
  SELECT * FROM filtered WHERE tier = 'tier_A' ORDER BY score DESC
),
b_pool AS (
  SELECT * FROM filtered WHERE tier = 'tier_B' ORDER BY score DESC
),
c_pool AS (
  SELECT * FROM filtered WHERE tier = 'tier_C' ORDER BY score DESC
),
-- AI系と非AI系を分類
ai_focused AS (
  SELECT * FROM filtered
  WHERE genre IN ('AI', 'AI活用', 'AI活用/自動化', 'ChatGPT', 'Claude', 'LLM', '生成AI')
),
non_ai_focused AS (
  SELECT * FROM filtered
  WHERE genre NOT IN ('AI', 'AI活用', 'AI活用/自動化', 'ChatGPT', 'Claude', 'LLM', '生成AI')
),
-- AI系から20本取得（ランダムサンプリング）
ai_selected AS (
  SELECT *, TRUE AS is_ai_focused
  FROM ai_focused
  ORDER BY RAND()
  LIMIT 20
),
-- 非AI系から30本取得（門口さん除外 - 別途全文抽出済み）（ランダムサンプリング）
non_ai_selected AS (
  SELECT *, FALSE AS is_ai_focused
  FROM non_ai_focused
  WHERE username != 'mon_guchi'
  ORDER BY RAND()
  LIMIT 30
)

SELECT * FROM ai_selected
UNION ALL
SELECT * FROM non_ai_selected
ORDER BY score DESC
  `;

  type Row = {
    account_name?: string;
    username?: string;
    post_date?: string;
    content?: string;
    impressions?: number;
    likes?: number;
    genre?: string;
    followers?: number;
    followers_delta?: number;
    evaluation?: string;
    tier?: string;
    score?: number;
    is_ai_focused?: boolean;
  };

  const rows = await runQuery<Row>(client, sql);
  return rows.map((row) => ({
    account_name: row.account_name ?? '',
    username: row.username ?? '',
    post_date: toPlainString(row.post_date) ?? '',
    content: row.content ?? '',
    impressions: Number(row.impressions ?? 0),
    likes: Number(row.likes ?? 0),
    genre: row.genre ?? '',
    followers: Number(row.followers ?? 0),
    followers_delta: Number(row.followers_delta ?? 0),
    evaluation: (row.evaluation ?? 'pattern_win') as 'pattern_win' | 'pattern_niche_hit' | 'pattern_hidden_gem',
    tier: (row.tier ?? 'tier_C') as 'tier_S' | 'tier_A' | 'tier_B' | 'tier_C',
    score: Number(row.score ?? 0),
    is_ai_focused: row.is_ai_focused ?? false,
  }));
}

async function fetchOwnWinningPosts(
  client: BigQuery,
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<OwnPost[]> {
  const sql = `
WITH daily AS (
  SELECT
    date AS daily_date,
    followers_snapshot,
    followers_snapshot - LAG(followers_snapshot) OVER (ORDER BY date) AS followers_delta
  FROM \`${projectId}.${DATASET}.threads_daily_metrics\`
),
posts AS (
  SELECT
    post_id,
    DATE(posted_at) AS post_date,
    content,
    impressions_total,
    likes_total
  FROM \`${projectId}.${DATASET}.threads_posts\`
  WHERE posted_at IS NOT NULL
),
joined AS (
  SELECT
    p.*,
    COALESCE(d1.followers_delta,0) + COALESCE(d2.followers_delta,0) AS followers_delta_2d
  FROM posts p
  LEFT JOIN daily d1
    ON p.post_date = d1.daily_date
  LEFT JOIN daily d2
    ON DATE_ADD(p.post_date, INTERVAL 1 DAY) = d2.daily_date
),
evaluated AS (
  SELECT
    post_id,
    post_date,
    content,
    impressions_total,
    likes_total,
    followers_delta_2d,
    CASE
      WHEN impressions_total >= 10000 AND followers_delta_2d >= 30 THEN "pattern_win"
      WHEN impressions_total >= 10000 AND followers_delta_2d BETWEEN 10 AND 29 THEN "pattern_niche_hit"
      WHEN impressions_total >= 10000 AND followers_delta_2d < 10 THEN "pattern_buzz_only"
      WHEN impressions_total BETWEEN 3000 AND 9999 AND followers_delta_2d >= 30 THEN "pattern_hidden_gem"
      WHEN impressions_total BETWEEN 3000 AND 9999 AND followers_delta_2d BETWEEN 10 AND 29 THEN "pattern_niche_hit"
      ELSE "pattern_fail"
    END AS evaluation,
    (COALESCE(followers_delta_2d, 0) * 12.0) + (COALESCE(impressions_total, 0) / 2000.0) AS score
  FROM joined
  WHERE post_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY) AND CURRENT_DATE()
)
SELECT *
FROM evaluated
WHERE evaluation IN ("pattern_win", "pattern_niche_hit", "pattern_hidden_gem")
ORDER BY RAND()
LIMIT 10
  `;

  type Row = {
    post_id?: string;
    post_date?: string;
    content?: string;
    impressions_total?: number;
    likes_total?: number;
    followers_delta_2d?: number;
    evaluation?: string;
    score?: number;
  };

  const rows = await runQuery<Row>(client, sql);
  return rows.map((row) => ({
    post_id: row.post_id ?? '',
    post_date: toPlainString(row.post_date) ?? '',
    content: row.content ?? '',
    impressions_total: Number(row.impressions_total ?? 0),
    likes_total: Number(row.likes_total ?? 0),
    followers_delta_2d: Number(row.followers_delta_2d ?? 0),
    evaluation: (row.evaluation ?? 'pattern_win') as 'pattern_win' | 'pattern_niche_hit' | 'pattern_hidden_gem',
    score: Number(row.score ?? 0),
  }));
}

async function fetchMonguchiPosts(
  client: BigQuery,
  projectId: string,
  startDate: string,
  endDate: string,
): Promise<MonguchiPost[]> {
  const sql = `
WITH max_post AS (
  SELECT MAX(DATE(post_date)) AS latest_date
  FROM \`${projectId}.${DATASET}.competitor_posts_raw\`
),
latest_genre AS (
  SELECT
    username,
    ARRAY_AGG(STRUCT(date, genre) ORDER BY date DESC LIMIT 1)[OFFSET(0)].genre AS genre
  FROM \`${projectId}.${DATASET}.competitor_account_daily\`
  GROUP BY username
),
daily AS (
  SELECT
    username,
    date AS daily_date,
    followers,
    CASE
      WHEN LAG(followers) OVER (PARTITION BY username ORDER BY date) IS NULL THEN 0
      WHEN LAG(followers) OVER (PARTITION BY username ORDER BY date) = 0 THEN 0
      ELSE followers - LAG(followers) OVER (PARTITION BY username ORDER BY date)
    END AS followers_delta
  FROM \`${projectId}.${DATASET}.competitor_account_daily\`
  WHERE followers > 0
),
joined AS (
  SELECT
    p.account_name,
    p.username,
    DATE(p.post_date) AS post_date,
    p.content,
    p.impressions,
    p.likes,
    g.genre,
    d.followers,
    COALESCE(d.followers_delta, 0) AS followers_delta,
    CASE
      WHEN p.impressions >= 30000 AND COALESCE(d.followers_delta,0) >= 40 THEN "pattern_win"
      WHEN p.impressions >= 30000 AND COALESCE(d.followers_delta,0) BETWEEN 15 AND 39 THEN "pattern_niche_hit"
      WHEN p.impressions BETWEEN 10000 AND 29999 AND COALESCE(d.followers_delta,0) >= 15 THEN "pattern_niche_hit"
      WHEN p.impressions < 30000 AND COALESCE(d.followers_delta,0) >= 40 THEN "pattern_hidden_gem"
      ELSE "pattern_other"
    END AS evaluation,
    CASE
      WHEN p.impressions >= 30000 AND COALESCE(d.followers_delta,0) >= 100 THEN "tier_S"
      WHEN (p.impressions >= 20000 AND COALESCE(d.followers_delta,0) >= 50)
           OR (p.impressions < 20000 AND COALESCE(d.followers_delta,0) >= 80) THEN "tier_A"
      WHEN p.impressions >= 20000 AND COALESCE(d.followers_delta,0) >= 30 THEN "tier_B"
      ELSE "tier_C"
    END AS tier,
    (COALESCE(d.followers_delta,0) * 12.0) + (p.impressions / 2000.0) AS score
  FROM \`${projectId}.${DATASET}.competitor_posts_raw\` p
  CROSS JOIN max_post m
  LEFT JOIN latest_genre g ON p.username = g.username
  LEFT JOIN daily d ON p.username = d.username AND DATE(p.post_date) = d.daily_date
  WHERE DATE(p.post_date) BETWEEN DATE_SUB(m.latest_date, INTERVAL 30 DAY) AND m.latest_date
    AND p.username = 'mon_guchi'
    AND LENGTH(p.content) > 500
)
SELECT *
FROM joined
WHERE evaluation IN ("pattern_win","pattern_niche_hit","pattern_hidden_gem")
  AND tier IN ('tier_S', 'tier_A')
ORDER BY RAND()
LIMIT 5
  `;

  type Row = {
    account_name?: string;
    username?: string;
    post_date?: string;
    content?: string;
    impressions?: number;
    likes?: number;
    followers?: number;
    followers_delta?: number;
    tier?: string;
    score?: number;
  };

  const rows = await runQuery<Row>(client, sql);
  return rows.map((row) => ({
    account_name: row.account_name ?? '',
    username: row.username ?? '',
    post_date: toPlainString(row.post_date) ?? '',
    content: row.content ?? '',
    impressions: Number(row.impressions ?? 0),
    likes: Number(row.likes ?? 0),
    followers: Number(row.followers ?? 0),
    followers_delta: Number(row.followers_delta ?? 0),
    tier: (row.tier ?? 'tier_C') as 'tier_S' | 'tier_A' | 'tier_B' | 'tier_C',
    score: Number(row.score ?? 0),
  }));
}

export function buildScheduleSlots(count: number, startHour = 7, intervalMinutes = 90): string[] {
  const slots: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const minutes = startHour * 60 + i * intervalMinutes;
    const hour = Math.floor(minutes / 60) % 24;
    const minute = minutes % 60;
    slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
  }
  return slots;
}

export async function buildThreadsPromptPayload(options: BuildPromptOptions): Promise<ThreadsPromptPayload> {
  const projectId = resolveProjectId(options.projectId);
  const client = createBigQueryClient(projectId);

  let rangeDays = Math.max(1, options.rangeDays ?? 7);
  const referenceDate = options.referenceDate ? new Date(`${options.referenceDate}T00:00:00Z`) : new Date();

  let startDate = new Date(referenceDate);
  let endDate = new Date(referenceDate);
  let useCustomRange = false;

  if (options.startDate && options.endDate) {
    const parsedStart = new Date(`${options.startDate}T00:00:00Z`);
    const parsedEnd = new Date(`${options.endDate}T00:00:00Z`);

    if (!Number.isNaN(parsedStart.getTime()) && !Number.isNaN(parsedEnd.getTime())) {
      if (parsedStart > parsedEnd) {
        startDate = parsedEnd;
        endDate = parsedStart;
      } else {
        startDate = parsedStart;
        endDate = parsedEnd;
      }

      const diffMs = endDate.getTime() - startDate.getTime();
      rangeDays = Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
      useCustomRange = true;
    }
  }

  if (!useCustomRange) {
    rangeDays = Math.max(1, options.rangeDays ?? 7);
    endDate = new Date(referenceDate);
    startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - (rangeDays - 1));
  }

  const startDateStr = startDate.toISOString().slice(0, 10);
  const endDateStr = endDate.toISOString().slice(0, 10);

  const [accountSummary, topSelfPosts, competitorHighlights, trendingTopics, templateSummaries, postCount, competitorSelected, ownWinningPosts, monguchiPosts] =
    await Promise.all([
      fetchAccountSummary(client, projectId, rangeDays, startDateStr, endDateStr),
      fetchTopSelfPosts(client, projectId, startDateStr, endDateStr),
      fetchCompetitorHighlights(client, projectId, startDateStr, endDateStr),
      fetchTrendingTopics(client, projectId, startDateStr, endDateStr),
      fetchTemplateSummaries(client, projectId),
      fetchPostCount(client, projectId, startDateStr, endDateStr),
      fetchCompetitorSelected(client, projectId, startDateStr, endDateStr),
      fetchOwnWinningPosts(client, projectId, startDateStr, endDateStr),
      fetchMonguchiPosts(client, projectId, startDateStr, endDateStr),
    ]);

  const targetCount = 10;
  const generationId = options.referenceDate ?? new Date().toISOString().slice(0, 10);

  const curatedSelfPosts = curateSelfPosts(topSelfPosts);
  const competitorStructures = buildCompetitorStructures(competitorHighlights);

  return {
    meta: {
      generationId,
      targetPostCount: targetCount,
      recommendedSchedule: buildScheduleSlots(targetCount),
      rangeDays,
      rangeStart: startDateStr,
      rangeEnd: endDateStr,
    },
    accountSummary,
    topSelfPosts,
    competitorHighlights,
    trendingTopics,
    templateSummaries,
    postCount,
    curatedSelfPosts,
    competitorStructures,
    writingChecklist: WRITING_CHECKLIST,
    competitorSelected,
    ownWinningPosts,
    monguchiPosts,
  };
}
