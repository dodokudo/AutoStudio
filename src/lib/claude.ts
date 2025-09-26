import { ThreadsPromptPayload } from '@/types/prompt';

const CLAUDE_API_URL = process.env.CLAUDE_API_URL ?? 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514';

const AI_THEME_KEYWORDS = ['ai', 'chatgpt', 'claude', 'llm', '生成', '自動化'];

const JSON_SCHEMA_EXAMPLE = `{
  "post": {
    "planId": "plan-01",
    "templateId": "hook_negate_v3",
    "theme": "AI活用で月30時間削減",
    "scheduledTime": "07:00",
    "mainPost": "...150-200文字...",
    "comments": ["...400-600文字...", "...400-600文字..."]
  }
}`;

const KUDO_MASTER_PROMPT = String.raw`# MISSION
あなたは工藤さんのThreads投稿を完璧に再現するプロのAIマーケティングライターです。
以下の全要素を統合し、10万閲覧レベルの投稿を生成してください。

## 工藤さんの文体DNA【完全解析】

### リズム・テンポ設計
- 冒頭インパクト（3秒以内に具体的数値）
- 短文でフック → 長文で詳細 → 短文で締め
- 関西弁要素の絶妙配置：「マジで」（驚き時）「やばい」（効果強調）「だるくない？」（共感誘発）
- 改行による間：重要ポイント前は必ず改行で注意引く
- 音声入力風の自然な流れ：「〜なんですよね」「〜じゃないですか」多用

### 体験談挿入の黄金パターン
- 失敗からの逆転：「僕も最初は○○だったけど」→具体的な転換点→劇的改善
- リアル感演出：「カップラーメン1分も待てないくらいせっかち」
- 感情変化の描写：「衝撃受けました」「別次元になった」「激変しました」
- 謙虚さと成果のバランス：成果自慢にならない絶妙なライン

### 共感・ツッコミ要素の心理設計
- 読者の心の声代弁：「○○って感じたことないですか？」
- あるある感の演出：具体的な困りごとを先に提示
- 軽いツッコミ：「時代遅れすぎです」「舐めてんの」（親しみやすさ維持）
- 仲間意識醸成：「一緒に○○しましょう」（上から目線完全排除）

## 心理トリガー完全体系

### 危機感煽りの段階的設計
Level1：疑問提起（「まだ○○してるの？」）
Level2：現状認識（「それ、実は○○なんです」）
Level3：具体的損失（「その方法だと○時間無駄に」）
Level4：競合優位（「使える人はもう○○で差をつけてる」）
Level5：行動促進（「今すぐ試さないとマジで損」）

### 共感ポイントの緻密設計
痛みの代弁：
- 作業効率：「タイピングでちまちま入力するのってだるくない？」
- 時間浪費：「30分も悩んでる時間マジでもったいない」
- スキル不安：「難しそうで手が出ない気持ち、分かります」

感情の理解：
- せっかち感：「僕、カップラーメン1分も待てないくらい」
- 完璧主義の罠：「失礼のないように考えすぎて何も書けない」
- 情報過多：「結局どれ使えばいいか分からない」

### 権威性の自然な演出
実績の見せ方：
- 具体的数値：「月収7桁」「1日30人フォロワー増」「13,189閲覧達成」
- 失敗からの成長：「昔は1時間かけてたけど今は30秒」
- 検証済み感：「1年使い込んだ結論」「実際に試した結果がこれ」

信頼性の担保：
- 失敗談開示：「恥を覚悟で話します」「上司に大目玉くらった」
- 限界認識：「完璧じゃないけど」「注意点もあります」
- 継続改善：「さらに良い方法見つけたら共有しますね」

## 投稿パターン別完全設計

### パターン1：数値・効率化型
心理的流れ：現状不満→可能性提示→方法開示→行動促進

冒頭設計テンプレート：
「[作業名]、[Before時間]が[After時間]になります。」
+ 体験談：「僕も最初は[失敗体験]だったけど」
+ 驚き演出：「これマジで別次元になった」

ノウハウ密度設計：
- 基本手順（3-5ステップ、各ステップに具体例）
- 応用テクニック（「さらに○○すると精度爆上がり」）
- 組み合わせ技（「これと○○を組み合わせると」）
- 注意点・失敗回避（「ただし○○は注意が必要で」）
- 検証方法（「効果を確かめるには○○してみて」）

### パターン2：危機感煽り型
心理的流れ：現状認識→危機感醸成→解決策提示→安心感付与

危機感の段階的醸成：
冒頭：「○○してる人、[強い否定語]です」
共感：「○○って感じたことないですか？」
現実突きつけ：「実はそれ、○○なんです」
具体的損失：「その結果、○○時間無駄にしてます」
競合優位：「使える人はもう○○で差をつけてる」

解決への転換：
「でも、この方法知ってから人生変わりました」
→ 具体的改善法（3-4ステップ）
→ 結果保証（「これで絶対変わります」）

### パターン3：逆説・常識破壊型
心理的流れ：常識提示→強烈否定→真実暴露→新常識定着

常識破壊テンプレート：
「○○って思ってる人、完全に間違ってます」
+ 一般認識確認：「普通○○って考えますよね？」
+ 強烈否定：「でもそれ、実は逆なんです」
+ 証拠提示：「実際のデータがこれ▼」
+ 体験談裏付け：「僕が実証済みです」

説得力強化要素：
- データ根拠：「最新の調査で○○が判明」
- 専門家見解：「業界では常識になってる」
- 成功事例：「実際に結果出してる人はみんな○○」
- 反論先回り：「でも○○って思うかもですが、実は○○」

### パターン4：比較・使い分け型
心理的流れ：混乱状態→整理→判断基準明示→選択支援

比較軸の体系的設計：
- 機能面：「○○は[具体的機能]が得意、××は[具体的機能]が強い」
- 使用場面：「[具体的シーン]なら○○、[具体的シーン]なら××」
- 習得コスト：「初心者は○○から、慣れたら××に移行」
- 結果の質：「スピード重視なら○○、質重視なら××」

決断支援設計：
- 明確な使い分け基準（フローチャート式）
- 両方使う選択肢の積極推奨
- 始めやすい方の具体的推奨理由
- 段階的ステップアップの道筋

### パターン5：裏技・秘密ノウハウ型
心理的流れ：好奇心喚起→驚きの事実→理解促進→習得支援

秘匿性演出テンプレート：
「○○の裏技、知らない人多すぎて損してます」
+ 希少価値：「これ知ってる人と知らない人で10倍差」
+ 発見ストーリー：「たまたま気づいたんですけど」
+ 効果の意外性：「機械なのに感情に反応するって衝撃でした」
+ 検証プロセス：「半信半疑で試したら激変した」

ノウハウの段階的開示：
Level1：基本テクニック（誰でもできる）
Level2：応用パターン（効果倍増）
Level3：組み合わせ技（上級者向け）
Level4：カスタマイズ法（個人最適化）

### パターン6：失敗談・注意喚起型
心理的流れ：失敗開示→共感獲得→学習内容→予防策提示

失敗談の効果的語り方：
- 恥の開示：「恥を覚悟で話します」「穴があったら入りたい」
- 具体的描写：「上司に大目玉」「クライアントに謝罪」
- 感情描写：「マジで焦った」「冷や汗が止まらなかった」
- 学習転換：「でもこの失敗のおかげで気づけた」

注意喚起の段階設計：
- 失敗パターンの類型化（よくある3-5パターン）
- 早期発見の兆候（「こうなったら危険信号」）
- 予防法の具体化（「事前にこれをチェック」）
- リカバリ手順（「もし失敗したらこう対処」）

## 実行用テンプレート

### 基本情報入力
- テーマ：[具体的なAIハウツー]
- ターゲット：[AI初心者/中級者/特定職業]
- パターン：[1-6から選択]
- 狙うインプレッション：[5,000-100,000]

### 工藤さん要素チェックリスト
□ 関西弁要素3箇所以上使用
□ 体験談を自然に挿入
□ 具体的数値を冒頭3秒以内に
□ 共感要素「○○って感じません？」
□ 視覚的区切り「実際こんな感じ▼」使用
□ 音声入力風の自然な流れ
□ 上から目線完全排除
□ すぐ実践できる具体性

### 出力指示
**文字数配分**
- メイン投稿：150-200文字（インパクト重視）
- コメント欄1：400-600文字（体験談+基本ノウハウ）
- コメント欄2：400-600文字（応用+注意点+行動促進）

**品質基準**
- 100,000閲覧レベルの価値提供
- フォロワー30人増加レベルの魅力
- コメント10件以上獲得レベルの議論喚起

上記全要素を統合し、工藤さんの成功投稿を完璧に再現してください。
手抜き厳禁。120点レベルの出力を求めます。`;

interface ClaudePlanResponsePost {
  planId?: string;
  templateId?: string;
  theme?: string;
  scheduledTime?: string;
  mainPost: string;
  comments: string[];
}

export interface ClaudePlanResponse {
  posts: ClaudePlanResponsePost[];
}

function sanitizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function enforceAiTheme(rawTheme: string, payload: ThreadsPromptPayload): string {
  const trimmed = rawTheme.trim();
  if (!trimmed) {
    return payload.writingChecklist.enforcedTheme;
  }

  const lower = trimmed.toLowerCase();
  if (AI_THEME_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return trimmed;
  }

  return `${payload.writingChecklist.enforcedTheme} - ${trimmed}`;
}

function formatLightSelfPost(payload: ThreadsPromptPayload, index: number): string {
  if (!payload.curatedSelfPosts.length) {
    return '- 自社投稿データが不足。AIテーマで体験談とHowToを補強してください。';
  }
  const sample = payload.curatedSelfPosts[index % payload.curatedSelfPosts.length];
  const comments = sample.comments.length
    ? sample.comments.map((comment, idx) => `    - コメント${idx + 1}: ${comment}`).join('\n')
    : '    - コメント: （補足をここに追加）';
  return [
    `- 閲覧数 ${sample.impressions.toLocaleString()} / いいね ${sample.likes.toLocaleString()}`,
    `  - main: ${sample.mainPost}`,
    comments,
  ].join('\n');
}

function formatLightCompetitorStructure(payload: ThreadsPromptPayload, index: number): string {
  if (!payload.competitorStructures.length) {
    return '- 構文サンプルなし。自社投稿の構成を軸にしてください。';
  }
  const sample = payload.competitorStructures[index % payload.competitorStructures.length];
  return `- ${sample.accountName}${sample.username ? ` (@${sample.username})` : ''}
  - 構成の特徴: ${sample.structureSummary}
  - サンプル本文: ${sample.example}`;
}

function formatLightTemplates(payload: ThreadsPromptPayload): string {
  if (!payload.templateSummaries.length) {
    return '- hook_negate_v3 / hook_before_after など既存命名を活用。';
  }
  return payload.templateSummaries
    .slice(0, 3)
    .map((template) => {
      const info: string[] = [];
      if (template.structureNotes) info.push(template.structureNotes);
      if (template.impressionAvg72h) info.push(`閲覧平均${Math.round(template.impressionAvg72h)}`);
      if (template.likeAvg72h) info.push(`いいね平均${Math.round(template.likeAvg72h)}`);
      return `- ${template.templateId} (v${template.version}) [${template.status}] ${info.join(' / ')}`;
    })
    .join('\n');
}

function buildLightweightContext(payload: ThreadsPromptPayload, index: number): string {
  const schedule = payload.meta.recommendedSchedule[index] ?? '任意の最適時間';
  const accountLine = `平均フォロワー: ${payload.accountSummary.averageFollowers.toLocaleString()} / 平均プロフ閲覧: ${payload.accountSummary.averageProfileViews.toLocaleString()} / 最新増減 フォロワー ${payload.accountSummary.followersChange >= 0 ? '+' : ''}${payload.accountSummary.followersChange}・プロフ閲覧 ${payload.accountSummary.profileViewsChange >= 0 ? '+' : ''}${payload.accountSummary.profileViewsChange}`;

  return [
    '# CONTEXT (lightweight)',
    '## アカウントの現状',
    `- ${accountLine}`,
    '## 強制テーマ',
    `- ${payload.writingChecklist.enforcedTheme}`,
    `- 優先キーワード: ${payload.writingChecklist.aiKeywords.join(', ')}`,
    '## 今回作成する投稿',
    `- 投稿番号: ${index + 1} / 合計 ${payload.meta.targetPostCount} 本`,
    `- 推奨投稿時刻: ${schedule}`,
    '## 参考にする自社投稿（構造とトーン）',
    formatLightSelfPost(payload, index),
    '## 参考にする競合構文（テーマは絶対に真似しない）',
    formatLightCompetitorStructure(payload, index),
    '## 推奨テンプレート候補',
    formatLightTemplates(payload),
    '## ライティングリマインダー',
    payload.writingChecklist.reminders.map((item) => `- ${item}`).join('\n'),
    '## JSON出力仕様',
    `- 返答は ${JSON_SCHEMA_EXAMPLE} 形式のみ。追加テキスト禁止。
- mainPost は「メイン投稿」、comments[0] は「コメント欄1」、comments[1] は「コメント欄2」。
- コメントは0〜2件。文字数目安: mainPost 150-200文字、comments 400-600文字。
- theme にはAI関連ワードを必ず含める。`,
  ].join('\n');
}

function buildPrompt(payload: ThreadsPromptPayload, index: number): string {
  const context = buildLightweightContext(payload, index);
  return [context, '', KUDO_MASTER_PROMPT].join('\n\n');
}

function validateSingleResponse(payload: ThreadsPromptPayload, raw: unknown): ClaudePlanResponsePost {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Claude response is not an object.');
  }

  const record = (raw as { post?: unknown; posts?: unknown[] }).post
    ?? (Array.isArray((raw as { posts?: unknown[] }).posts) ? (raw as { posts: unknown[] }).posts[0] : undefined);

  if (!record || typeof record !== 'object') {
    throw new Error('Claude response is missing `post` object.');
  }

  const post = record as Record<string, unknown>;
  const mainPost = sanitizeString(post.mainPost ?? post.main);
  if (!mainPost) {
    throw new Error('Claude response is missing mainPost content.');
  }

  const commentsRaw = Array.isArray(post.comments) ? post.comments : [];
  const comments = commentsRaw.slice(0, 2).map((value, index) => {
    const text = sanitizeString(value);
    if (!text) {
      return index === 0
        ? '※コメント欄1に入れる補足・体験談をここに記述してください。'
        : '※コメント欄2では応用・注意喚起・CTAを補強してください。';
    }
    return text;
  });

  return {
    planId: sanitizeString(post.planId),
    templateId: sanitizeString(post.templateId) || 'auto-generated',
    scheduledTime: sanitizeString(post.scheduledTime),
    theme: enforceAiTheme(sanitizeString(post.theme), payload),
    mainPost,
    comments,
  } satisfies ClaudePlanResponsePost;
}

async function requestClaude(prompt: string) {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 3500,
      temperature: 0.7,
      system:
        'You are an expert Japanese social media planner who outputs strict JSON only. Never use markdown code blocks or explanations. Respect all constraints from the user prompt.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API error: ${response.status} ${response.statusText} ${text}`);
  }

  const data = await response.json();
  const textContent = data?.content?.[0]?.text;
  if (!textContent || typeof textContent !== 'string') {
    throw new Error('Unexpected Claude response format');
  }

  const cleanContent = textContent
    .replace(/```json\s*\n?/gi, '')
    .replace(/```\s*$/g, '')
    .trim();

  try {
    return JSON.parse(cleanContent) as unknown;
  } catch {
    const sanitized = cleanContent
      // remove trailing commas before ] or }
      .replace(/,\s*([\]}])/g, '$1')
      // remove extra commas in arrays of strings (",\s*]" cases)
      .replace(/,(\s*\])/g, '$1')
      // normalize smart quotes to regular quotes
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, '\'')
      // strip zero-width / non-breaking spaces
      .replace(/[\u00A0\u200B\u200C\u200D]/g, '');
    try {
      return JSON.parse(sanitized) as unknown;
    } catch (secondError) {
      console.error('Raw Claude response:', textContent);
      console.error('Cleaned content:', cleanContent);
      console.error('Sanitized content:', sanitized);
      const preview = sanitized.slice(0, 200).replace(/\s+/g, ' ');
      throw new Error(`Failed to parse Claude JSON response after repair: ${(secondError as Error).message}. snippet=${preview}`);
    }
  }
}

async function generateSingleClaudePost(payload: ThreadsPromptPayload, index: number): Promise<ClaudePlanResponsePost> {
  if (!CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY is not configured');
  }

  const prompt = buildPrompt(payload, index);
  const parsed = await requestClaude(prompt);
  return validateSingleResponse(payload, parsed);
}

export async function generateClaudePlans(payload: ThreadsPromptPayload): Promise<ClaudePlanResponse> {
  const posts: ClaudePlanResponsePost[] = [];
  for (let index = 0; index < payload.meta.targetPostCount; index += 1) {
    const post = await generateSingleClaudePost(payload, index);
    posts.push(post);
  }
  return { posts };
}
