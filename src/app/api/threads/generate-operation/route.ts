import { resolveProjectId, createBigQueryClient } from '@/lib/bigquery';
import { replaceTodayPlans } from '@/lib/bigqueryPlans';
import { THREADS_OPERATION_PROMPT } from '@/lib/threadsOperationPrompt';
import { searchMultipleTopics } from '@/lib/tavily/client';
import type { PlanStatus, ThreadPlanSummary } from '@/types/threadPlan';
import type { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';

type StreamEvent =
  | { type: 'stage'; stage: string; message: string }
  | { type: 'start'; total: number }
  | { type: 'progress'; stage: string; current: number; total: number; elapsedMs?: number }
  | { type: 'complete'; itemsCount: number }
  | { type: 'error'; message: string };

function createHeaders() {
  return {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  } satisfies Record<string, string>;
}

interface ClaudePost {
  mainPost: string;
  comment1: string;
  comment2: string;
  theme?: string;
}

const CLAUDE_API_URL = process.env.CLAUDE_API_URL?.trim() ?? 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY?.trim();
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

// Threads運用テーマリスト（130個 = 既存50個 + 新規80個）
const THREADS_THEMES = [
  // バズる投稿の書き方（10個）
  'Threadsでバズる投稿の書き方、完全公開します',
  'Threadsの長文投稿で10万インプレッションを超える方法',
  'Threadsのコメント欄活用で滞在時間を3倍にする技術',
  'Threadsのフックの書き方、データで証明された最強パターン',
  'Threads投稿の構成、3部構成で勝率が5倍になった話',
  'Threadsで体験談を入れると平均インプレッションが2倍になる理由',
  'ThreadsのBefore→After訴求、数値で示すと反応が劇的に変わる',
  'Threadsの箇条書き、①②③を使うだけで読了率が上がった',
  'Threadsの改行テクニック、視認性を上げてエンゲージメント向上',
  'Threads投稿の文字数、1000字前後が最も効果的なデータ',

  // フォロワー増加戦略（10個）
  'Threadsのフォロワーが増えない人の共通点5つ',
  'Threads運用、1ヶ月で1600名増やした完全ロードマップ',
  'Threadsのフォロワー増加、投稿頻度を変えたら爆伸びした',
  'Threadsのいいね周り、やめたら逆にフォロワーが増えた話',
  'Threadsのリプライ対応、全返信したら信頼性が段違いになった',
  'Threadsのアカウント設計、プロフィール最適化で反応率3倍',
  'Threadsの投稿比率、長文8割・短文2割が最強だった',
  'Threadsのフォロー返し戦略、完全に時代遅れな理由',
  'Threadsの相互フォロー、やめたら質の高いフォロワーが増えた',
  'Threadsの投稿ジャンル、一貫性を保つとフォロワー定着率が上がる',

  // エンゲージメント向上（10個）
  'Threadsのエンゲージメント、投稿後30分が勝負な理由',
  'Threadsのいいね率、0.5%超えたら勝ち投稿の法則',
  'Threadsの保存数、この指標を追うとアルゴリズムに評価される',
  'Threadsのコメント獲得、質問形式で3倍になった方法',
  'Threadsのシェア数、controversy要素を入れると増える',
  'Threadsの滞在時間、長文コメント欄で延ばす技術',
  'Threadsのリーチ拡大、おすすめタブに載る投稿の共通点',
  'Threadsのインプレッション、初速が命な理由とその対策',
  'Threadsのエンゲージメント率、何%が合格ラインか',
  'Threadsの反応率、曜日別データで最適タイミングを見極める',

  // アルゴリズム攻略（10個）
  'Threadsアルゴリズムの真実、活発さが全てだった',
  'Threadsのおすすめ欄、載る投稿と載らない投稿の違い',
  'Threadsの表示順序、時系列じゃない理由と攻略法',
  'Threadsのシャドウバン、避けるべき3つの行動',
  'Threadsのアカウント評価、信頼スコアを上げる方法',
  'Threadsの投稿品質、アルゴリズムが見ている指標',
  'Threadsのスパム判定、自動化ツールは絶対NGな理由',
  'Threadsのフォロワー外リーチ、これを増やす5つの戦略',
  'Threadsの投稿削除、アルゴリズムへの影響とリスク',
  'Threadsのアカウント復活、低迷から抜け出す完全ガイド',

  // 投稿時間・頻度（10個）
  'Threadsの投稿時間、9割の人が間違えている最適タイミング',
  'Threadsの朝6-9時投稿、勝率43%の黄金時間帯',
  'Threadsの夜18-21時、平均インプレッション3953の最強時間',
  'Threadsの午後15-18時、絶対避けるべき死の時間帯',
  'Threads投稿頻度、1日10投稿以上がアルゴリズムに評価される',
  'Threadsの週末投稿、土日19時は勝ち投稿の36%が集中',
  'Threadsの投稿間隔、連投より分散が効果的な理由',
  'Threadsの月曜朝投稿、今週から試すモチベーションに最適',
  'Threadsの深夜投稿、0-6時は効率が悪いデータ',
  'Threadsの投稿予約、計画的に最適時間を狙う戦略',

  // プロフィール最適化（10個）
  'Threadsプロフィールの自己紹介文、3行で完結させる書き方',
  'Threadsのアイコン画像、反応率が3倍変わる選び方',
  'Threadsプロフィールの実績の書き方、信頼性を高める3つの型',
  'ThreadsのCTA設計、LINE登録率を高める記号活用術',
  'Threadsの名前設定、一瞬で専門性を伝える公式',
  'Threadsプロフィールで避けるべきNGワード集',
  'Threadsの肩書き作成、差別化する組み合わせ術',
  'Threadsプロフィール、実績がない場合の書き方',
  'Threadsのリンク設置、クリック率を3倍にする導線設計',
  'Threadsプロフィール、ターゲットを明確にする書き方',

  // フック作成術（10個）
  'Threadsの質問投げかけ型フック、エンゲージメントを高める書き方',
  'Threadsの「引用」型フック、共感を生む活用法',
  'Threadsの記号強調型フック、視覚的インパクトの作り方',
  'Threadsのフック、ターゲットを明確にする「〇〇してる人」パターン',
  'Threadsのフック、損失回避を活用する心理テクニック',
  'Threadsのフック、具体的な金額を入れる効果',
  'Threadsのフック、緊急性を演出する言葉選び',
  'Threadsのフック、意外性とギャップを作る方法',
  'Threadsのフック、弱いパターンから強いパターンへの改善法',
  'Threadsのフック組み合わせ戦略、警告型×数字使用型',

  // コンテンツタイプ別戦略（10個）
  'Threadsのよくある間違い系投稿の作り方',
  'Threadsの比較・使い分け系投稿、表形式活用術',
  'ThreadsのBefore→After訴求、数値で示す効果的な書き方',
  'Threadsのステップバイステップ投稿、再現性を高める方法',
  'Threadsの企業事例活用法、信頼性を高める書き方',
  'Threadsの「パクって実践」系投稿の作り方',
  'Threadsの結論先出し型投稿、読者を引き込む構成',
  'Threadsのストーリー系投稿、避けるべき理由',
  'Threadsの質問系投稿、エンゲージメント率が低い理由',
  'Threadsの共感系投稿、売上につながらない理由',

  // 投稿構造・デザイン（10個）
  'Threadsの番号付きリスト、平均インプレッションを高める使い方',
  'Threadsの箇条書き活用法、視認性を高めるテクニック',
  'Threadsの【】記号の使い方、セクションを明確にする方法',
  'Threadsの→ここでのポイント、補足情報の効果的な書き方',
  'Threadsの絵文字使用戦略、使いすぎを避ける基準',
  'Threadsの中長文最適化、400-600字に収める編集術',
  'Threadsの視覚的インパクト、タイムラインで目立つ構造',
  'Threadsの段落分け、スマホで読みやすい改行ポイント',
  'Threadsの長文投稿と短文投稿、見込み客の質の違い',
  'Threadsの投稿構造テンプレート、コピペで使える型',

  // 時間帯・投稿頻度戦略追加（10個）
  'Threadsの昼12-15時投稿戦略',
  'Threadsの早朝0-6時、投稿を避けるべき理由',
  'Threadsの土曜日投稿戦略、週末のリラックスタイム活用法',
  'Threadsの日曜日夜投稿、「明日から」系が強い理由',
  'Threadsの月曜朝投稿、通勤時間を狙う戦略',
  'Threadsのゴールデンタイム集中戦略、65%配分の実践法',
  'Threadsの1日12.5件投稿、最低限のスケジュール組み方',
  'Threadsの投稿タイミング、競合が少ない時間帯の見つけ方',
  'Threadsの週末投稿比率、36%を活用する方法',
  'Threadsの死の時間帯、午後15-18時と午前9-12時を避ける理由',

  // データ分析・改善（10個）
  'Threadsの勝ち投稿分析、10,000imp以上を出す7つの法則',
  'Threadsの失敗投稿分析、1,000imp未満の3大パターン',
  'Threadsのインプレッション分布、勝率2.8%の意味',
  'Threadsの平均インプレッション、2,500から3,500に上げる方法',
  'Threadsのフックパターン別勝率、データに基づく選び方',
  'Threadsのサブタイプ別平均imp、8倍の差がつく理由',
  'Threadsの文字数最適化、201-400字が最強の理由',
  'Threadsの投稿後分析、改善すべきポイントの見つけ方',
  'Threadsの競合分析シート、5つのアカウントから勝ちパターンを抽出する方法',
  'Threadsの4週間プログラム、段階的に改善するロードマップ',

  // エンゲージメント向上追加（10個）
  'ThreadsのCTA設計、フォロー促進の書き方',
  'Threadsのコメント返信戦略、エンゲージメント率を高める方法',
  'Threadsの保存されやすい投稿、ロードマップ系が強い理由',
  'Threadsのシェアされやすい投稿、実用性を高める書き方',
  'Threadsのいいね周り、効果的なタイミングと方法',
  'Threadsのフォロー返し戦略、質の高いフォロワーの見分け方',
  'Threadsのリプライ活用、滞在時間を延ばすテクニック',
  'ThreadsのLINE誘導、CVR 0.013%を高める特典設計',
  'Threadsの投稿削除判断、シャドウバンを避ける基準',
  'Threadsのアカウント評価、エンゲージメント率を重視する理由',

  // ジャンル別応用（10個）
  'Threadsの美容系投稿、薬機法を守りながら訴求する方法',
  'Threadsの料理系投稿、時短レシピで反応を得るコツ',
  'Threadsのビジネス系投稿、月○万円訴求の効果的な書き方',
  'Threadsの育児系投稿、具体的な褒め方・叱り方の書き方',
  'Threadsの恋愛系投稿、マッチングアプリ攻略ネタの作り方',
  'Threadsの趣味系投稿、初心者向けロードマップの構成',
  'Threadsのジャンル変換ワークシート、AI系から他ジャンルへの変換法',
  'Threadsのネタ切れ対策、マトリクス法で無限にネタを出す方法',
  'Threadsのジャンル別NGパターン、避けるべき表現集',
  'Threadsの差別化ポイント、競合と被らないテーマの見つけ方',
];

// フックパターン（門口さん・スギさんの分析を反映した7パターン）
type HookPattern = 'warning' | 'number' | 'title' | 'emotion' | 'story' | 'authority' | 'contrast';

const HOOK_PATTERNS: Array<{ type: HookPattern; weight: number; templates: string[] }> = [
  {
    type: 'warning',
    weight: 35, // 35%の確率（門口さんパターン: 警告型65%を反映）
    templates: [
      '{theme}、9割の人が間違ってます',
      '{theme}、完全に時代遅れです',
      '{theme}、知らない人多すぎて損してます',
      '{theme}、やってない人マジでもったいないです',
      '{theme}してる人、アカウント伸びません',
      '{theme}、今すぐやめないと終わります',
    ],
  },
  {
    type: 'number',
    weight: 20, // 20%の確率（スギさんパターン: データ型35%を反映）
    templates: [
      '{theme}、1ヶ月でフォロワー1600名増えました',
      '{theme}、126万インプレッション達成した方法',
      '{theme}、498件のデータ分析で判明しました',
      '{theme}、平均インプレッションが7.3倍になった話',
      '{theme}、4ヶ月で1万人達成した全手法',
    ],
  },
  {
    type: 'authority',
    weight: 15, // 15%の確率（門口さんパターン: 権威型20%を反映）
    templates: [
      'Threadsの公式発表によると、{theme}',
      'Meta最新アップデート、{theme}',
      'Threads運用者必見、{theme}が変わります',
      '【公式情報】{theme}',
    ],
  },
  {
    type: 'emotion',
    weight: 10, // 10%の確率（スギさんパターン: 感情型15%を反映）
    templates: [
      '私が絶対やらない{theme}',
      '正直、{theme}は大嫌いです',
      'すんごい嫌いな{theme}があって',
      '{theme}、イライラする人多すぎ',
    ],
  },
  {
    type: 'title',
    weight: 10, // 10%の確率
    templates: [
      '【緊急】{theme}',
      '【知らないとヤバい】{theme}',
      '【完全保存版】{theme}',
      '【実証済み】{theme}',
      '【超重要】{theme}',
    ],
  },
  {
    type: 'story',
    weight: 5, // 5%の確率（スギさんパターン: ストーリー型5%を反映）
    templates: [
      '私のThreads運用、{theme}で変わりました',
      'フォロワー100人の頃、{theme}を知らなかった',
      '{theme}を実践したら、人生変わった',
      'Threads始めて3ヶ月、{theme}に気づいた',
    ],
  },
  {
    type: 'contrast',
    weight: 5, // 5%の確率（スギさんパターン: 対比型5%を反映）
    templates: [
      '{theme}じゃない、実は〇〇です',
      'みんな{theme}と思ってるけど、違います',
      '{theme}、実は逆効果でした',
      '{theme}は間違い、本当は〇〇',
    ],
  },
];

function selectRandomThemes(count: number): string[] {
  const shuffled = [...THREADS_THEMES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function selectHookPattern(): { type: HookPattern; template: string } {
  const totalWeight = HOOK_PATTERNS.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;

  for (const pattern of HOOK_PATTERNS) {
    random -= pattern.weight;
    if (random <= 0) {
      const template = pattern.templates[Math.floor(Math.random() * pattern.templates.length)];
      return { type: pattern.type, template };
    }
  }

  // フォールバック
  const fallback = HOOK_PATTERNS[0];
  return { type: fallback.type, template: fallback.templates[0] };
}

function applyHookToTheme(theme: string, hookTemplate: string): string {
  return hookTemplate.replace('{theme}', theme);
}

interface MonguchiPost {
  account_name: string;
  username: string;
  post_date: string;
  content: string;
  impressions: number;
  likes: number;
  followers: number;
  followers_delta: number;
  tier: 'tier_S' | 'tier_A' | 'tier_B' | 'tier_C';
  score: number;
}

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

async function fetchMonguchiPostsForOperation(
  client: BigQuery,
  projectId: string,
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
LIMIT 20
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

async function generateThreadsOperationPosts(latestUpdates: string): Promise<ClaudePost[]> {
  if (!CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY is not configured');
  }

  // 門口さんの投稿を20件取得
  const client = createBigQueryClient(PROJECT_ID);
  const monguchiPosts = await fetchMonguchiPostsForOperation(client, PROJECT_ID);

  const selectedThemes = selectRandomThemes(10); // 10個のテーマを選択
  const posts: ClaudePost[] = [];

  for (let i = 0; i < selectedThemes.length; i++) {
    const theme = selectedThemes[i];

    // 最初の3投稿は強制的にauthority型（Web検索結果活用）
    let hook;
    if (i < 3) {
      const authorityTemplates = [
        'Threadsの公式発表によると、{theme}',
        'Meta最新アップデート、{theme}',
        'Threads運用者必見、{theme}が変わります',
        '【公式情報】{theme}',
      ];
      const template = authorityTemplates[Math.floor(Math.random() * authorityTemplates.length)];
      hook = { type: 'authority' as HookPattern, template };
    } else {
      hook = selectHookPattern();
    }

    const finalTheme = applyHookToTheme(theme, hook.template);

    // 門口さんの投稿例をプロンプトに追加
    const monguchiExamples = monguchiPosts.map((post, idx) => {
      return `### 参考例${idx + 1}（${post.impressions.toLocaleString()}imp / フォロワー増${post.followers_delta}名 / ${post.tier}）\n${post.content}\n`;
    }).join('\n');

    const latestUpdatesSection = latestUpdates
      ? `# Threadsの最新アップデート情報
以下の最新情報を参考に、タイムリーでトレンド性のあるコンテンツを作成してください。
特に「権威型」フック（公式発表、最新情報）として活用できます。

${latestUpdates}

`
      : '';

    const prompt = `${THREADS_OPERATION_PROMPT}

${latestUpdatesSection}# 門口さんの実際の投稿例（直近30日間の高パフォーマンス投稿20件）
以下の投稿の構成・文体・リズム・表現を完全にトレースしてThreads運用系の投稿を作成してください。
特に以下の要素を真似る:
- フックの作り方
- 体験談の入れ方
- 数値の見せ方
- 箇条書きの使い方
- 改行のリズム
- 関西弁のトーン
- Before→Afterの訴求方法

${monguchiExamples}

# 今回の生成依頼
## テーマ
${theme}

## 出力形式
以下のJSON形式で返してください（markdown不要）:
{
  "mainPost": "メイン投稿150-200文字",
  "comment1": "コメント1: 必ず400文字以上、最大500文字",
  "comment2": "コメント2: 必ず400文字以上、最大500文字"
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        temperature: 0.9,
        system: 'You are an expert Japanese social media planner who outputs strict JSON only. Never use markdown code blocks or explanations. Respect all constraints from the user prompt. IMPORTANT: Use \\n\\n for line breaks in text content to improve readability. CRITICAL: Never use emojis in any generated content.',
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Claude API error: ${response.status} ${response.statusText} ${text}`);
    }

    const data = await response.json();
    const textContent = data?.content?.[0]?.text;

    if (!textContent || typeof textContent !== 'string') {
      throw new Error('Unexpected Claude response format');
    }

    // Remove markdown code blocks
    let cleanContent = textContent;
    const fenceToken = '```';
    cleanContent = cleanContent.split(fenceToken + 'json').join('');
    cleanContent = cleanContent.split(fenceToken).join('');
    cleanContent = cleanContent.trim();

    const parsed = JSON.parse(cleanContent);
    posts.push({ ...parsed, theme });
  }

  return posts;
}

export async function POST() {
  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array>();
  const writer = stream.writable.getWriter();

  const send = async (event: StreamEvent) => {
    try {
      const payload = JSON.stringify({ ...event, timestamp: new Date().toISOString() });
      await writer.write(encoder.encode(`${payload}\n`));
    } catch (error) {
      console.error('[threads/generate-operation] Failed to send stream event', error);
    }
  };

  (async () => {
    const startTime = Date.now();
    try {
      await send({ type: 'stage', stage: 'initializing', message: 'Threads運用系投稿を準備しています…' });

      // Web検索を実行（Threads最新情報）
      await send({ type: 'stage', stage: 'searching', message: 'Threadsの最新情報を検索中…' });
      let threadsLatestUpdates = '';
      try {
        const today = new Date();
        const thisMonth = `${today.getFullYear()}年${today.getMonth() + 1}月`;

        const updateTopics = [
          `Threads 新機能 ${thisMonth}`,
          `Threads アルゴリズム 変更 最新`,
          `Meta Threads アップデート 公式発表`,
        ];

        const searchResults = await searchMultipleTopics(updateTopics);

        if (searchResults.length > 0) {
          threadsLatestUpdates = searchResults
            .slice(0, 3)
            .map((r, idx) => `### 最新情報${idx + 1}: ${r.title}\n${r.content.slice(0, 200)}\nURL: ${r.url}\n`)
            .join('\n');
        }
      } catch (error) {
        console.error('[threads/generate-operation] Tavily search failed:', error);
        // Web検索失敗してもプロンプト生成は継続
      }

      await send({ type: 'stage', stage: 'fetching', message: '門口さんの高パフォーマンス投稿20件を取得中…' });

      const total = 10;
      await send({ type: 'start', total });
      await send({ type: 'stage', stage: 'generating', message: `Claudeで投稿を生成中… (${total}件)` });

      const generationStartedAt = Date.now();
      const claudePosts = await generateThreadsOperationPosts(threadsLatestUpdates);

      await send({
        type: 'progress',
        stage: 'generating',
        current: total,
        total,
        elapsedMs: Date.now() - generationStartedAt,
      });

      const fallbackSchedule = ['07:00', '08:30', '10:00', '12:00', '14:00', '16:00', '18:00', '19:30', '21:00', '22:00'];
      const generatedPlans = claudePosts.map((post, index) => {
        const planId = `threads-op-${index + 1}`;
        const scheduledTime = fallbackSchedule[index] || '07:00';
        const templateId = 'threads-operation';
        const theme = post.theme || 'Threads運用ノウハウ';
        const status = 'draft' as PlanStatus;

        return {
          planId,
          scheduledTime,
          templateId,
          theme,
          mainText: post.mainPost,
          comments: [
            { order: 1, text: post.comment1 },
            { order: 2, text: post.comment2 },
          ],
          status,
        };
      });

      if (!generatedPlans.length) {
        throw new Error('[threads/generate-operation] Claude returned no posts');
      }

      await send({ type: 'stage', stage: 'persisting', message: 'BigQueryへ保存中…' });

      let summaries: ThreadPlanSummary[] = [];
      try {
        const persisted = await replaceTodayPlans(generatedPlans, fallbackSchedule);
        summaries = persisted.map((plan) => ({
          plan_id: plan.plan_id,
          generation_date: plan.generation_date,
          scheduled_time: plan.scheduled_time,
          status: plan.status,
          template_id: plan.template_id,
          theme: plan.theme,
          main_text: plan.main_text,
          comments: plan.comments,
          job_status: undefined,
          job_updated_at: undefined,
          job_error_message: undefined,
          log_status: undefined,
          log_error_message: undefined,
          log_posted_thread_id: undefined,
          log_posted_at: undefined,
        }));
      } catch (error) {
        console.error('[threads/generate-operation] Failed to persist plans to BigQuery:', error);
        await send({
          type: 'stage',
          stage: 'fallback',
          message: 'BigQueryへの保存に失敗しました。生成結果をそのまま利用します。',
        });
      }

      if (!summaries.length) {
        const todayJst = new Date().toLocaleDateString('ja-JP', {
          timeZone: 'Asia/Tokyo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).replace(/\//g, '-');
        const fallbackSummaries = generatedPlans.map((plan, index) => ({
          plan_id: plan.planId,
          generation_date: todayJst,
          scheduled_time: plan.scheduledTime ?? fallbackSchedule[index] ?? '07:00',
          status: plan.status ?? 'draft',
          template_id: plan.templateId,
          theme: plan.theme,
          main_text: plan.mainText,
          comments: JSON.stringify(plan.comments ?? []),
          job_status: undefined,
          job_updated_at: undefined,
          job_error_message: undefined,
          log_status: undefined,
          log_error_message: undefined,
          log_posted_thread_id: undefined,
          log_posted_at: undefined,
        }));
        summaries = fallbackSummaries;
      }

      await send({ type: 'stage', stage: 'finalizing', message: 'レスポンスを整えています…' });
      await send({
        type: 'progress',
        stage: 'finalizing',
        current: total,
        total,
        elapsedMs: Date.now() - startTime,
      });

      await send({ type: 'complete', itemsCount: summaries.length });
    } catch (error) {
      console.error('[threads/generate-operation] failed', error);
      const message = (error as Error).message ?? 'unknown error';
      await send({ type: 'error', message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    status: 200,
    headers: createHeaders(),
  });
}
