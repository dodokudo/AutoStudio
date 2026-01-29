import { BigQuery } from '@google-cloud/bigquery';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';

// 環境変数読み込み
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.prod') });

const PROJECT_ID = 'mark-454114';
const DATASET = 'autostudio_threads';

async function main() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });
  const outputDir = path.join(process.env.HOME || '/tmp', 'Downloads');

  const startDate = '2025-11-14';
  const endDate = '2026-01-12';

  console.log('TOP50投稿を取得中...');

  // TOP50投稿を取得
  const [rows] = await bigquery.query({
    query: `
      SELECT
        post_id,
        posted_at,
        content,
        COALESCE(impressions_total, 0) as impressions_total,
        COALESCE(likes_total, 0) as likes_total
      FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
      WHERE post_id IS NOT NULL
        AND post_id != ''
        AND DATE(posted_at) >= @startDate
        AND DATE(posted_at) <= @endDate
      ORDER BY impressions_total DESC
      LIMIT 50
    `,
    params: { startDate, endDate },
  });

  const posts = rows.map((row: any) => ({
    content: row.content || '',
    impressions: Number(row.impressions_total) || 0,
  }));

  console.log(`取得完了: ${posts.length}件`);

  // ==========================================
  // 1. 投稿1行目フック50選
  // ==========================================
  console.log('\n1. 投稿1行目フック50選を作成中...');

  const hooks = posts.map((post, i) => {
    const firstLine = post.content.split('\n')[0]
      .replace(/^【メイン投稿】\s*/, '')
      .trim();
    return {
      rank: i + 1,
      impressions: post.impressions,
      hook: firstLine,
    };
  });

  // フックのパターンを分析
  const hookPatterns = [
    { pattern: '損してます', category: '損失回避型', template: '{プラットフォーム}で{行動}してる人、マジで損してます。' },
    { pattern: '間違ってます', category: '指摘型', template: '{分野}の{要素}、{割合}の人が間違ってます。' },
    { pattern: '時代遅れ', category: '危機感型', template: 'まだ{古い方法}してる人、完全に時代遅れです。' },
    { pattern: '判明', category: '発見型', template: '【速報】{分野}で{要素}が判明したので、報告します。' },
    { pattern: '伸びません', category: '警告型', template: '{プラットフォーム}で{行動}してる人、伸びません。' },
    { pattern: '知ってました', category: '質問型', template: '{意外な事実}って知ってました？' },
    { pattern: 'しない方がいい', category: 'NG提示型', template: 'あのー、{プラットフォーム}で{行動}はしない方がいいですよ。' },
    { pattern: '逆効果', category: '逆説型', template: '{一般的な行動}してる人、完全に逆効果です。' },
    { pattern: '共通点', category: '分析型', template: '{成功事例}を分析したら{数}つの共通点がありました。' },
    { pattern: '法則', category: 'ノウハウ型', template: '{目標}を達成する{数}つの法則があるんです。' },
  ];

  // Excelファイル作成
  const hookWorkbook = new ExcelJS.Workbook();

  // シート1: フック50選
  const hookSheet = hookWorkbook.addWorksheet('フック50選');
  hookSheet.columns = [
    { header: '順位', key: 'rank', width: 8 },
    { header: 'imp', key: 'impressions', width: 12 },
    { header: '1行目フック', key: 'hook', width: 80 },
  ];

  // ヘッダースタイル
  hookSheet.getRow(1).font = { bold: true };
  hookSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  hooks.forEach(h => hookSheet.addRow(h));

  // シート2: フックテンプレート
  const templateSheet = hookWorkbook.addWorksheet('フックテンプレート');
  templateSheet.columns = [
    { header: 'カテゴリ', key: 'category', width: 15 },
    { header: 'キーワード', key: 'pattern', width: 15 },
    { header: 'テンプレート', key: 'template', width: 60 },
    { header: '使用例（穴埋め）', key: 'example', width: 60 },
  ];

  templateSheet.getRow(1).font = { bold: true };
  templateSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  hookPatterns.forEach(p => {
    templateSheet.addRow({
      category: p.category,
      pattern: p.pattern,
      template: p.template,
      example: '',
    });
  });

  const hookPath = path.join(outputDir, 'threads_hook_50.xlsx');
  await hookWorkbook.xlsx.writeFile(hookPath);
  console.log(`保存: ${hookPath}`);

  // ==========================================
  // 2. 投稿アイデア100ネタ帳
  // ==========================================
  console.log('\n2. 投稿アイデア100ネタ帳を作成中...');

  // TOP50から切り口を抽出して100ネタに展開
  const ideaCategories = [
    {
      category: '時間帯・タイミング系',
      ideas: [
        '投稿時間帯で結果が変わる話',
        '曜日別の最適投稿タイミング',
        '朝vs夜どっちが伸びるか検証',
        '深夜投稿がNGな理由',
        '連投のベストタイミング',
        '週末vs平日の違い',
        'ゴールデンタイムの真実',
        '投稿間隔の最適解',
        '祝日の投稿戦略',
        '月初vs月末の差',
      ],
    },
    {
      category: '文章・構成系',
      ideas: [
        '1行目フックの書き方',
        '長文vs短文どっちが伸びるか',
        '3部構成の黄金パターン',
        '改行の入れ方で変わる話',
        '箇条書きの正しい使い方',
        '数字を入れると伸びる理由',
        '絵文字は使うべきか問題',
        'コメント欄の設計方法',
        'CTAの入れ方',
        '文字数の最適解',
      ],
    },
    {
      category: 'アルゴリズム・システム系',
      ideas: [
        'シャドウバンの避け方',
        'アルゴリズムの仕組み',
        'インプレッションが伸びる条件',
        'フォロワーが増える投稿の特徴',
        'いいねが多い投稿の共通点',
        '削除するとアカウントに影響する話',
        'トピック設定の罠',
        'ハッシュタグは不要な理由',
        '連投のリスクと対策',
        'アカウント評価の仕組み',
      ],
    },
    {
      category: 'プロフィール系',
      ideas: [
        'プロフィール4行構成',
        'NGワード一覧',
        '実績の書き方',
        'CTAの入れ方',
        'アイコンの選び方',
        '名前の付け方',
        'リンクの設定',
        'フォローされるプロフィール',
        '専門用語を使わない理由',
        'ターゲット明記の重要性',
      ],
    },
    {
      category: 'データ分析系',
      ideas: [
        '〇〇件分析して分かったこと',
        '伸びる投稿TOP10の共通点',
        '失敗投稿の共通点',
        '月別パフォーマンス比較',
        '時間帯別データ公開',
        'フォロワー増加の法則',
        'インプレッションと売上の関係',
        'エンゲージメント率の真実',
        '競合分析の結果',
        '1ヶ月の運用データ公開',
      ],
    },
    {
      category: '失敗談・NG系',
      ideas: [
        'やってはいけない投稿5選',
        '伸びない人の共通点',
        '初心者がやりがちなミス',
        'フォロワーが減る行動',
        'シャドウバンになった体験談',
        '1000imp以下の投稿の特徴',
        'やめたら伸びたこと',
        '無駄だった施策',
        'お金をかけて失敗した話',
        '時間を無駄にした経験',
      ],
    },
    {
      category: '成功体験・実績系',
      ideas: [
        '〇ヶ月で〇名増えた方法',
        'バズった投稿の裏側',
        '1万impを超えた投稿の作り方',
        '月〇万稼いだ方法',
        'LINE登録が増えた施策',
        'フォロワー1000名達成までの道のり',
        '投稿頻度を変えて変わったこと',
        'コメント欄を使い始めて変わったこと',
        '長文投稿に変えて変わったこと',
        '朝投稿をやめて変わったこと',
      ],
    },
    {
      category: 'ノウハウ・テクニック系',
      ideas: [
        '今すぐ使える投稿テンプレート',
        'フック文の型10選',
        'CTA文例集',
        'コメント欄の書き方',
        'ネタ切れしない方法',
        '投稿を量産する方法',
        'AIを活用した投稿作成',
        'リサーチの方法',
        '競合から学ぶ方法',
        'PDCAの回し方',
      ],
    },
    {
      category: 'マインド・考え方系',
      ideas: [
        '伸びる人と伸びない人の違い',
        '継続するコツ',
        '結果が出るまでの期間',
        'モチベーション維持の方法',
        'フォロワー数に囚われない考え方',
        '質vs量の正解',
        '完璧主義をやめる理由',
        '毎日投稿は必要か',
        'フォロワー数より大切なこと',
        '売上に繋げる考え方',
      ],
    },
    {
      category: 'LINE誘導・マネタイズ系',
      ideas: [
        'LINE登録が増えるCTA',
        '特典設計の方法',
        'コメント欄での誘導方法',
        'リンククリック率を上げる方法',
        '売上に繋がる投稿の特徴',
        'ファン化する投稿',
        '信頼を構築する投稿',
        '教育コンテンツの作り方',
        'セールスに繋げる流れ',
        'DM誘導の是非',
      ],
    },
  ];

  const ideaWorkbook = new ExcelJS.Workbook();
  const ideaSheet = ideaWorkbook.addWorksheet('投稿アイデア100');

  ideaSheet.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'カテゴリ', key: 'category', width: 20 },
    { header: '投稿アイデア', key: 'idea', width: 40 },
    { header: '1行目フック例', key: 'hook', width: 50 },
    { header: '使用済み', key: 'used', width: 10 },
    { header: 'メモ', key: 'memo', width: 30 },
  ];

  ideaSheet.getRow(1).font = { bold: true };
  ideaSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  ideaSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  let ideaNo = 1;
  for (const cat of ideaCategories) {
    for (const idea of cat.ideas) {
      ideaSheet.addRow({
        no: ideaNo++,
        category: cat.category,
        idea: idea,
        hook: '',
        used: '',
        memo: '',
      });
    }
  }

  // カテゴリごとに色分け
  const categoryColors: Record<string, string> = {
    '時間帯・タイミング系': 'FFFFF2CC',
    '文章・構成系': 'FFE2EFDA',
    'アルゴリズム・システム系': 'FFDDEBF7',
    'プロフィール系': 'FFFCE4D6',
    'データ分析系': 'FFD9E1F2',
    '失敗談・NG系': 'FFFFD7D7',
    '成功体験・実績系': 'FFD5F5E3',
    'ノウハウ・テクニック系': 'FFE8DAEF',
    'マインド・考え方系': 'FFFFF9DB',
    'LINE誘導・マネタイズ系': 'FFDCEDC8',
  };

  for (let i = 2; i <= 101; i++) {
    const row = ideaSheet.getRow(i);
    const category = row.getCell('category').value as string;
    if (category && categoryColors[category]) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: categoryColors[category] } };
    }
  }

  const ideaPath = path.join(outputDir, 'threads_idea_100.xlsx');
  await ideaWorkbook.xlsx.writeFile(ideaPath);
  console.log(`保存: ${ideaPath}`);

  // ==========================================
  // 3. 投稿セルフチェックシート
  // ==========================================
  console.log('\n3. 投稿セルフチェックシートを作成中...');

  const checkWorkbook = new ExcelJS.Workbook();
  const checkSheet = checkWorkbook.addWorksheet('投稿セルフチェック');

  // タイトル行
  checkSheet.mergeCells('A1:E1');
  checkSheet.getCell('A1').value = 'Threads投稿セルフチェックシート';
  checkSheet.getCell('A1').font = { bold: true, size: 16 };
  checkSheet.getCell('A1').alignment = { horizontal: 'center' };

  checkSheet.mergeCells('A2:E2');
  checkSheet.getCell('A2').value = '投稿前にこのチェックリストで品質を確認してください。全て○になるまで投稿しないこと。';
  checkSheet.getCell('A2').font = { size: 10, color: { argb: 'FF666666' } };

  // セクション1: 1行目（フック）チェック
  let currentRow = 4;
  checkSheet.getCell(`A${currentRow}`).value = '【セクション1】1行目（フック）チェック';
  checkSheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
  checkSheet.getCell(`A${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  checkSheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  checkSheet.mergeCells(`A${currentRow}:E${currentRow}`);

  currentRow++;
  const hookChecks = [
    { no: 1, item: '「損してます」「間違ってます」など危機感を煽るワードが入っているか', good: '〇〇してる人、マジで損してます', bad: '〇〇について解説します' },
    { no: 2, item: '具体的な数字が入っているか', good: '832件分析して分かった〇〇', bad: 'たくさん分析して分かった〇〇' },
    { no: 3, item: '15-25文字以内に収まっているか', good: 'Threadsで短文投稿してる人、損してます', bad: 'Threadsで短文投稿ばっかりしてる人はマジで損してるから今すぐやめてください' },
    { no: 4, item: 'ターゲットが明確か（誰に向けた投稿か分かるか）', good: 'フォロワー100名以下の人、これやってください', bad: '皆さんに伝えたいことがあります' },
    { no: 5, item: '「続きが読みたい」と思わせる引きがあるか', good: '〇〇が判明したので報告します', bad: '〇〇について書きます' },
  ];

  checkSheet.columns = [
    { key: 'no', width: 6 },
    { key: 'item', width: 50 },
    { key: 'good', width: 35 },
    { key: 'bad', width: 35 },
    { key: 'check', width: 10 },
  ];

  checkSheet.getRow(currentRow).values = ['No', 'チェック項目', '良い例', '悪い例', '判定'];
  checkSheet.getRow(currentRow).font = { bold: true };
  checkSheet.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  currentRow++;
  hookChecks.forEach(check => {
    checkSheet.getRow(currentRow).values = [check.no, check.item, check.good, check.bad, ''];
    currentRow++;
  });

  // セクション2: 本文チェック
  currentRow++;
  checkSheet.getCell(`A${currentRow}`).value = '【セクション2】本文チェック';
  checkSheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
  checkSheet.getCell(`A${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  checkSheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  checkSheet.mergeCells(`A${currentRow}:E${currentRow}`);

  currentRow++;
  checkSheet.getRow(currentRow).values = ['No', 'チェック項目', '良い例', '悪い例', '判定'];
  checkSheet.getRow(currentRow).font = { bold: true };
  checkSheet.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  const bodyChecks = [
    { no: 1, item: '800文字以上あるか（長文推奨）', good: '800-1200文字', bad: '200文字以下の短文' },
    { no: 2, item: '「僕も最初は〇〇でした」の共感パートがあるか', good: '体験談→失敗→改善の流れ', bad: 'いきなりノウハウだけ' },
    { no: 3, item: '具体的な数値データが3つ以上入っているか', good: '2ヶ月で2500名増、167万imp', bad: 'たくさん増えました' },
    { no: 4, item: '箇条書き・ステップ形式で読みやすくなっているか', good: '①〇〇 ②〇〇 ③〇〇', bad: '長い文章がダラダラ続く' },
    { no: 5, item: '改行が適切に入っているか（2-3行ごと）', good: '適度な空白で読みやすい', bad: '改行なしのベタ打ち' },
    { no: 6, item: '専門用語を使わず、誰でも分かる言葉か', good: 'いいね・コメントが増える', bad: 'エンゲージメント率向上' },
  ];

  currentRow++;
  bodyChecks.forEach(check => {
    checkSheet.getRow(currentRow).values = [check.no, check.item, check.good, check.bad, ''];
    currentRow++;
  });

  // セクション3: コメント欄チェック
  currentRow++;
  checkSheet.getCell(`A${currentRow}`).value = '【セクション3】コメント欄チェック';
  checkSheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
  checkSheet.getCell(`A${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  checkSheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  checkSheet.mergeCells(`A${currentRow}:E${currentRow}`);

  currentRow++;
  checkSheet.getRow(currentRow).values = ['No', 'チェック項目', '良い例', '悪い例', '判定'];
  checkSheet.getRow(currentRow).font = { bold: true };
  checkSheet.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  const commentChecks = [
    { no: 1, item: 'コメント欄1: 本文の深掘り・具体例があるか', good: 'データ・事例・体験談の詳細', bad: '本文の繰り返し' },
    { no: 2, item: 'コメント欄1: 「じゃあ具体的にどうすればいいか」の接続があるか', good: 'じゃあ具体的にどうすればいいかっていうと▼', bad: '唐突にコメント2へ' },
    { no: 3, item: 'コメント欄2: 具体的なステップ・手順があるか', good: '①〇〇 ②〇〇 ③〇〇の3ステップ', bad: '抽象的なアドバイス' },
    { no: 4, item: 'コメント欄2: CTAが入っているか', good: 'フォローしておいてください＋リンク', bad: 'CTAなしで終わる' },
    { no: 5, item: 'コメント欄2: LINE誘導リンクが入っているか', good: '詳しくはこちら▼{URL}', bad: 'リンクなし' },
  ];

  currentRow++;
  commentChecks.forEach(check => {
    checkSheet.getRow(currentRow).values = [check.no, check.item, check.good, check.bad, ''];
    currentRow++;
  });

  // セクション4: NGワードチェック
  currentRow++;
  checkSheet.getCell(`A${currentRow}`).value = '【セクション4】NGワードチェック（使用していたら×）';
  checkSheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
  checkSheet.getCell(`A${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B6B' } };
  checkSheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  checkSheet.mergeCells(`A${currentRow}:E${currentRow}`);

  currentRow++;
  checkSheet.getRow(currentRow).values = ['No', 'NGワード', 'なぜNG', '修正例', '使用'];
  checkSheet.getRow(currentRow).font = { bold: true };
  checkSheet.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  const ngWords = [
    { no: 1, word: '「〇〇について解説します」', reason: '興味を引かない', fix: '「〇〇してる人、損してます」' },
    { no: 2, word: '「参考になれば嬉しいです」', reason: '自信がなさそう', fix: '「本気でやってみてください」' },
    { no: 3, word: '「いかがでしたか？」', reason: '古いブログ臭がする', fix: '削除してCTAに変更' },
    { no: 4, word: '「〇〇だと思います」', reason: '断定しないと響かない', fix: '「〇〇です」と言い切る' },
    { no: 5, word: '「皆さん」', reason: 'ターゲットが曖昧', fix: '「フォロワー100名以下の人」など具体化' },
    { no: 6, word: '絵文字の多用（3個以上）', reason: '軽い印象を与える', fix: '絵文字は1-2個まで' },
    { no: 7, word: 'ハッシュタグ', reason: 'Threadsでは不要', fix: '全削除' },
    { no: 8, word: '「初心者ですが」「勉強中」', reason: '学ぶ価値がないと判断される', fix: '「〇〇を実践中」' },
  ];

  currentRow++;
  ngWords.forEach(ng => {
    checkSheet.getRow(currentRow).values = [ng.no, ng.word, ng.reason, ng.fix, ''];
    currentRow++;
  });

  // セクション5: 投稿タイミングチェック
  currentRow++;
  checkSheet.getCell(`A${currentRow}`).value = '【セクション5】投稿タイミングチェック';
  checkSheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
  checkSheet.getCell(`A${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  checkSheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  checkSheet.mergeCells(`A${currentRow}:E${currentRow}`);

  currentRow++;
  checkSheet.getRow(currentRow).values = ['No', 'チェック項目', '推奨', '避けるべき', '判定'];
  checkSheet.getRow(currentRow).font = { bold: true };
  checkSheet.getRow(currentRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  const timingChecks = [
    { no: 1, item: '投稿時間帯は最適か', good: '18-22時（特に22時台がベスト）', bad: '深夜0-6時、8-11時' },
    { no: 2, item: '曜日は考慮したか', good: '月曜朝、週末夜', bad: '特に意識なし' },
    { no: 3, item: '前回投稿から適切な間隔か', good: '2-4時間空ける', bad: '連続投稿（30分以内）' },
  ];

  currentRow++;
  timingChecks.forEach(check => {
    checkSheet.getRow(currentRow).values = [check.no, check.item, check.good, check.bad, ''];
    currentRow++;
  });

  const checkPath = path.join(outputDir, 'threads_post_checklist.xlsx');
  await checkWorkbook.xlsx.writeFile(checkPath);
  console.log(`保存: ${checkPath}`);

  console.log('\n========================================');
  console.log('全ファイル作成完了！');
  console.log('========================================');
  console.log(`1. ${hookPath}`);
  console.log(`2. ${ideaPath}`);
  console.log(`3. ${checkPath}`);
}

main().catch(console.error);
