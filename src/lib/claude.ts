import { ThreadsPromptPayload } from '@/types/prompt';
import { sanitizeThreadsComment, sanitizeThreadsMainPost } from './threadsText';

const CLAUDE_API_URL = process.env.CLAUDE_API_URL?.trim() ?? 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY?.trim();
const CLAUDE_MODEL = process.env.CLAUDE_MODEL?.trim() ?? 'claude-sonnet-4-5-20250929';

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

function formatCompetitorSelected(payload: ThreadsPromptPayload): string {
  if (!payload.competitorSelected || !payload.competitorSelected.length) {
    return '- 競合選抜データなし';
  }

  const aiPosts = payload.competitorSelected.filter(p => p.is_ai_focused);
  const nonAiPosts = payload.competitorSelected.filter(p => !p.is_ai_focused);

  const sections: string[] = [];

  if (aiPosts.length) {
    sections.push(`### AI系発信者（${aiPosts.length}本）- テーマ・構成・トーン すべて学習`);
    aiPosts.forEach((post, idx) => {
      sections.push(`${idx + 1}. @${post.username} (${post.genre})`);
      sections.push(`   - スコア: ${post.score.toFixed(1)} / インプ: ${post.impressions.toLocaleString()} / フォロワー増: +${post.followers_delta}`);
      sections.push(`   - 評価: ${post.evaluation} / ティア: ${post.tier}`);
      sections.push(`   - 本文: ${post.content.slice(0, 500)}`);
    });
  }

  if (nonAiPosts.length) {
    sections.push('');
    sections.push(`### 非AI系発信者（${nonAiPosts.length}本）- 構成のみ学習（テーマは真似しない）`);
    nonAiPosts.forEach((post, idx) => {
      sections.push(`${idx + 1}. @${post.username} (${post.genre})`);
      sections.push(`   - スコア: ${post.score.toFixed(1)} / インプ: ${post.impressions.toLocaleString()} / フォロワー増: +${post.followers_delta}`);
      sections.push(`   - 評価: ${post.evaluation} / ティア: ${post.tier}`);
      sections.push(`   - 本文: ${post.content.slice(0, 500)}`);
    });
  }

  return sections.join('\n');
}

function formatOwnWinningPosts(payload: ThreadsPromptPayload): string {
  if (!payload.ownWinningPosts || !payload.ownWinningPosts.length) {
    return '- 自社勝ち投稿データなし';
  }

  const topPosts = payload.ownWinningPosts.slice(0, 10);
  const sections: string[] = [];

  sections.push('### 自社過去勝ち投稿トップ10（全10本から抽出）');
  topPosts.forEach((post, idx) => {
    sections.push(`${idx + 1}. スコア: ${post.score.toFixed(1)} / インプ: ${post.impressions_total.toLocaleString()} / フォロワー増(2日): +${post.followers_delta_2d}`);
    sections.push(`   - 評価: ${post.evaluation}`);
    sections.push(`   - 本文: ${post.content.slice(0, 500)}`);
  });

  const evalCounts = payload.ownWinningPosts.reduce((acc, post) => {
    acc[post.evaluation] = (acc[post.evaluation] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  sections.push('');
  sections.push(`### 勝ちパターン分布（全10本）`);
  sections.push(`- pattern_win: ${evalCounts.pattern_win || 0}本`);
  sections.push(`- pattern_niche_hit: ${evalCounts.pattern_niche_hit || 0}本`);
  sections.push(`- pattern_hidden_gem: ${evalCounts.pattern_hidden_gem || 0}本`);

  return sections.join('\n');
}

function formatMonguchiPosts(payload: ThreadsPromptPayload): string {
  if (!payload.monguchiPosts || !payload.monguchiPosts.length) {
    return '- 門口さんの投稿データなし';
  }

  const sections: string[] = [];
  sections.push('### 🌟 門口さん（@mon_guchi）- 固定ポスト誘導の達人');
  sections.push(`ティアS/Aから上位5本を特別抽出。固定ポスト・プロフィール誘導手法を特に注目して学習。`);
  sections.push('');

  payload.monguchiPosts.forEach((post, idx) => {
    sections.push(`${idx + 1}. スコア: ${post.score.toFixed(1)} / インプ: ${post.impressions.toLocaleString()} / フォロワー増: +${post.followers_delta}`);
    sections.push(`   - ティア: ${post.tier}`);
    sections.push(`   - 投稿日: ${post.post_date}`);
    sections.push(`   - 全文: ${post.content}`);
    sections.push('');
  });

  return sections.join('\n');
}

function buildBatchContext(payload: ThreadsPromptPayload): string {
  const accountLine = `平均フォロワー: ${payload.accountSummary.averageFollowers.toLocaleString()} / 平均プロフ閲覧: ${payload.accountSummary.averageProfileViews.toLocaleString()} / 最新増減 フォロワー ${payload.accountSummary.followersChange >= 0 ? '+' : ''}${payload.accountSummary.followersChange}・プロフ閲覧 ${payload.accountSummary.profileViewsChange >= 0 ? '+' : ''}${payload.accountSummary.profileViewsChange}`;

  const schedules = payload.meta.recommendedSchedule
    .map((time, idx) => `  ${idx + 1}本目: ${time}`)
    .join('\n');

  return [
    '# CONTEXT (batch generation)',
    '## アカウントの現状',
    `- ${accountLine}`,
    '## 強制テーマ',
    `- ${payload.writingChecklist.enforcedTheme}`,
    `- 優先キーワード: ${payload.writingChecklist.aiKeywords.join(', ')}`,
    '## 今回作成する投稿',
    `- 合計: ${payload.meta.targetPostCount} 本を一度に生成`,
    '- 推奨投稿時刻:',
    schedules,
    '',
    '## 【最重要】門口さん特別枠',
    formatMonguchiPosts(payload),
    '',
    '## 【重要】競合勝ち構成パターン（AI系10本 + 非AI系20本 = 30本）',
    '以下の競合投稿から構成パターンを学習してください。',
    '**AI系発信者**: テーマ・構成・トーン すべて参考にする',
    '**非AI系発信者**: 構成・フック・展開方法のみ参考（テーマは絶対に真似しない）',
    '**注意**: 門口さん投稿は上記の特別枠で全文抽出済みのため、ここには含まれません',
    formatCompetitorSelected(payload),
    '',
    '## 【重要】自社過去勝ち投稿（10本から学習）',
    '以下の自社投稿から、勝ちパターン・トーン・文体DNAを把握してください。',
    formatOwnWinningPosts(payload),
    '',
    '## ライティングリマインダー',
    payload.writingChecklist.reminders.map((item) => `- ${item}`).join('\n'),
    '',
    '## 生成指示',
    '1. 🌟 門口さんの投稿から固定ポスト誘導の手法を最優先で学習',
    '   - 「固定の特典でも解説してるんですが」のような自然な誘導文',
    '   - プロフィールや固定投稿への導線設計',
    '',
    '2. 競合30本（AI系10本 + 非AI系20本）の構成パターンを分析：',
    '   - AI系10本: テーマ・構成・トーン すべて学習',
    '   - 非AI系20本: 構成・フック・展開・締め方のみ学習（テーマは絶対に真似しない）',
    '',
    '3. 自社10本から、工藤さんの文体DNA・トーン・勝ちパターンを把握',
    '',
    `4. 上記を統合し、**多様性を最優先**して${payload.meta.targetPostCount}本まとめて生成`,
    '   **【超重要】多様性の確保:**',
    '   - 各投稿は完全に異なるテーマ・フック・構成にすること',
    '   - 同じフレーズ（「まだ〜してる人」「マジで」など）を複数投稿で使わない',
    '   - テーマのバリエーション例: 自動化、効率化、時短、品質向上、コスト削減、ミス防止、学習支援、クリエイティブ、分析など',
    '   - 数字のバリエーション例: 30時間、90%、10倍、5分、3ステップ、50%削減など',
    '   - フックのバリエーション例: 疑問形、否定形、驚き、体験談、逆説、比較など',
    `   - ${payload.meta.targetPostCount}本全体を俯瞰し、意図的にバランスを取ること',
    '',
    '5. 各投稿は必ずAIテーマに限定',
    '',
    '## JSON出力仕様',
    '- 返答は以下の形式のみ。追加テキスト禁止:',
    '{',
    '  "posts": [',
    '    {',
    '      "planId": "[plan-01など]",',
    '      "templateId": "[適切なテンプレートID]",',
    '      "theme": "[上記の競合・自社投稿から学んだAI関連テーマ]",',
    '      "scheduledTime": "[推奨時刻から選択]",',
    '      "mainPost": "[メイン投稿150-200文字]",',
    '      "comments": ["[コメント欄1: 400-600文字]", "[コメント欄2: 400-600文字]"]',
    '    },',
    '    {',
    '      "planId": "[plan-02など]",',
    '      ...',
    '    }',
    '    // 合計' + payload.meta.targetPostCount + '本を生成',
    '  ]',
    '}',
    '',
    '**重要**: 上記はフォーマット例です。実際の内容は以下から学習して生成:',
    '- テーマ・構成: 門口さん5本 + 競合30本 + 自社10本',
    '- 文体・トーン: 工藤さんの自社10本 + KUDO_MASTER_PROMPT',
    '- 多様性: 各投稿で異なるテーマ・フック・数字・表現を使用',
  ].join('\n');
}

function buildBatchPrompt(payload: ThreadsPromptPayload): string {
  const context = buildBatchContext(payload);
  return [context, '', KUDO_MASTER_PROMPT].join('\n\n');
}

function validateBatchResponse(payload: ThreadsPromptPayload, raw: unknown): ClaudePlanResponsePost[] {
  console.log('[claude] Validating batch response structure:', {
    type: typeof raw,
    isNull: raw === null,
    isArray: Array.isArray(raw),
    keys: raw && typeof raw === 'object' ? Object.keys(raw) : []
  });

  if (!raw || typeof raw !== 'object') {
    console.error('[claude] Invalid response: not an object', raw);
    throw new Error('Claude response is not an object.');
  }

  const rawObj = raw as { posts?: unknown[] };

  if (!Array.isArray(rawObj.posts)) {
    console.error('[claude] Missing posts array in response', { raw, hasPosts: !!rawObj.posts });
    throw new Error('Claude response is missing posts array.');
  }

  console.log('[claude] Found posts array, length:', rawObj.posts.length);

  const validatedPosts = rawObj.posts.map((post, idx) => {
    console.log('[claude] Validating post ' + (idx + 1) + '/' + rawObj.posts!.length);
    return validateSinglePost(payload, post, idx);
  });

  return validatedPosts;
}

function validateSinglePost(payload: ThreadsPromptPayload, raw: unknown, index: number): ClaudePlanResponsePost {
  console.log('[claude] Validating response structure:', {
    type: typeof raw,
    isNull: raw === null,
    isArray: Array.isArray(raw),
    keys: raw && typeof raw === 'object' ? Object.keys(raw) : []
  });

  if (!raw || typeof raw !== 'object') {
    console.error('[claude] Invalid response: not an object', raw);
    throw new Error('Claude response is not an object.');
  }

  const rawObj = raw as { post?: unknown; posts?: unknown[] };
  const record = rawObj.post ?? (Array.isArray(rawObj.posts) ? rawObj.posts[0] : undefined);

  console.log('[claude] Extracted record:', {
    hasPost: !!rawObj.post,
    hasPosts: !!rawObj.posts,
    postsLength: Array.isArray(rawObj.posts) ? rawObj.posts.length : 'not array',
    recordType: typeof record,
    recordKeys: record && typeof record === 'object' ? Object.keys(record) : []
  });

  if (!record || typeof record !== 'object') {
    console.error('[claude] Missing post object in response', { raw, record });
    throw new Error('Claude response is missing post object.');
  }

  const post = record as Record<string, unknown>;
  const mainPostRaw = sanitizeString(post.mainPost ?? post.main);
  const mainPost = sanitizeThreadsMainPost(mainPostRaw);

  console.log('[claude] Post validation:', {
    hasMainPost: !!post.mainPost,
    hasMain: !!post.main,
    mainPostLength: mainPost.length,
    hasComments: Array.isArray(post.comments),
    commentsLength: Array.isArray(post.comments) ? post.comments.length : 'not array',
    planId: sanitizeString(post.planId),
    theme: sanitizeString(post.theme)
  });

  if (!mainPost) {
    console.error('[claude] Missing mainPost content', post);
    throw new Error('Claude response is missing mainPost content.');
  }

  const commentsRaw = Array.isArray(post.comments) ? post.comments : [];
  const comments = commentsRaw.slice(0, 2).map((value, index) => {
    const text = sanitizeThreadsComment(sanitizeString(value));
    if (!text) {
      return index === 0
        ? '※コメント欄1に入れる補足・体験談をここに記述してください。'
        : '※コメント欄2では応用・注意喚起・CTAを補強してください。';
    }
    return text;
  });

  const result = {
    planId: sanitizeString(post.planId),
    templateId: sanitizeString(post.templateId) || 'auto-generated',
    scheduledTime: sanitizeString(post.scheduledTime),
    theme: enforceAiTheme(sanitizeString(post.theme), payload),
    mainPost,
    comments,
  } satisfies ClaudePlanResponsePost;

  console.log('[claude] Final validated result:', {
    planId: result.planId,
    templateId: result.templateId,
    theme: result.theme,
    mainPostLength: result.mainPost.length,
    commentsCount: result.comments.length
  });

  return result;
}

async function requestClaude(prompt: string) {
  console.log('[claude] Sending request to Claude API...');
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      temperature: 0.9,
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
    console.error('[claude] API error:', response.status, response.statusText, text);
    throw new Error('Claude API error: ' + response.status + ' ' + response.statusText + ' ' + text);
  }

  const data = await response.json();
  console.log('[claude] Raw API response structure:', {
    hasContent: !!data?.content,
    contentLength: data?.content?.length,
    firstContentType: data?.content?.[0]?.type
  });

  const textContent = data?.content?.[0]?.text;
  if (!textContent || typeof textContent !== 'string') {
    console.error('[claude] Unexpected response format:', data);
    throw new Error('Unexpected Claude response format');
  }

  console.log('[claude] Raw text content length:', textContent.length);
  console.log('[claude] Raw text content preview:', textContent.slice(0, 300));

  const cleanContent = textContent
    .replace(/```json\s*\n?/gi, '')
    .replace(/```\s*$/g, '')
    .trim();

  console.log('[claude] Clean content length:', cleanContent.length);
  console.log('[claude] Clean content preview:', cleanContent.slice(0, 300));

  try {
    const parsed = JSON.parse(cleanContent) as unknown;
    console.log('[claude] Successfully parsed JSON:', {
      type: typeof parsed,
      hasPost: parsed && typeof parsed === 'object' && 'post' in parsed,
      hasPosts: parsed && typeof parsed === 'object' && 'posts' in parsed,
      keys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : []
    });
    return parsed;
  } catch (firstError) {
    console.log('[claude] First JSON parse failed, attempting repair...');
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

    console.log('[claude] Sanitized content length:', sanitized.length);
    console.log('[claude] Sanitized content preview:', sanitized.slice(0, 300));

    try {
      const parsed = JSON.parse(sanitized) as unknown;
      console.log('[claude] Successfully parsed sanitized JSON:', {
        type: typeof parsed,
        hasPost: parsed && typeof parsed === 'object' && 'post' in parsed,
        hasPosts: parsed && typeof parsed === 'object' && 'posts' in parsed,
        keys: parsed && typeof parsed === 'object' ? Object.keys(parsed) : []
      });
      return parsed;
    } catch (secondError) {
      console.error('[claude] Failed to parse JSON after all repairs');
      console.error('[claude] Raw Claude response:', textContent);
      console.error('[claude] Cleaned content:', cleanContent);
      console.error('[claude] Sanitized content:', sanitized);
      console.error('[claude] First error:', firstError);
      console.error('[claude] Second error:', secondError);
      const preview = sanitized.slice(0, 200).replace(/\s+/g, ' ');
      throw new Error('Failed to parse Claude JSON response after repair: ' + (secondError as Error).message + '. snippet=' + preview);
    }
  }
}

async function generateBatchClaudePosts(payload: ThreadsPromptPayload): Promise<ClaudePlanResponsePost[]> {
  if (!CLAUDE_API_KEY) {
    console.error('[claude] CLAUDE_API_KEY is not configured. Available env vars:', Object.keys(process.env).filter(k => k.includes('CLAUDE')));
    throw new Error('CLAUDE_API_KEY is not configured');
  }

  console.log('[claude] CLAUDE_API_KEY found, length:', CLAUDE_API_KEY.length);
  console.log('[claude] Generating ' + payload.meta.targetPostCount + ' posts in batch mode');

  const prompt = buildBatchPrompt(payload);
  console.log('[claude] Batch prompt length:', prompt.length, 'characters');

  const parsed = await requestClaude(prompt);
  return validateBatchResponse(payload, parsed);
}

interface GenerateClaudePlansOptions {
  onProgress?: (payload: { current: number; total: number }) => void | Promise<void>;
}

export async function generateClaudePlans(
  payload: ThreadsPromptPayload,
  options: GenerateClaudePlansOptions = {},
): Promise<ClaudePlanResponse> {
  console.log('[claude] Starting batch generation mode');

  // バッチ生成（1回のAPI呼び出しで全投稿生成）
  const posts = await generateBatchClaudePosts(payload);

  console.log('[claude] Batch generation complete: ' + posts.length + ' posts generated');

  // プログレス通知（互換性のため）
  if (options.onProgress) {
    await options.onProgress({ current: posts.length, total: posts.length });
  }

  return { posts };
}
