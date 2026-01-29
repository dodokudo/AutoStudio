import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';
import * as path from 'path';
import ExcelJS from 'exceljs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const bigquery = new BigQuery({ projectId: 'mark-454114' });

function extractHook(content: string): string {
  if (!content) return '';

  const lines = content.split('\n').map(l => l.trim()).filter(l => l);

  for (const line of lines) {
    // 「【メイン投稿】」「【コメント欄1】」などのラベル行はスキップ
    if (line.startsWith('【') && line.endsWith('】')) continue;
    // 空行スキップ
    if (!line) continue;
    // 実際のフックを返す
    return line;
  }

  return '';
}

async function main() {
  console.log('TOP50投稿を取得中...');

  const [rows] = await bigquery.query({
    query: `
      SELECT content, impressions_total
      FROM \`mark-454114.autostudio_threads.threads_posts\`
      WHERE post_id IS NOT NULL AND post_id != ''
        AND DATE(posted_at) >= '2025-11-14'
        AND DATE(posted_at) <= '2026-01-12'
      ORDER BY impressions_total DESC
      LIMIT 50
    `,
  });

  console.log(`取得完了: ${rows.length}件`);

  const hooks = rows.map((row: any, i: number) => {
    const hook = extractHook(row.content || '');
    return {
      rank: i + 1,
      impressions: Number(row.impressions_total) || 0,
      hook: hook,
    };
  });

  // 確認出力
  console.log('\n--- フック確認 ---');
  hooks.slice(0, 10).forEach(h => {
    console.log(`${h.rank}. [${h.impressions}imp] ${h.hook}`);
  });

  // Excelファイル作成
  const workbook = new ExcelJS.Workbook();

  // シート1: フック50選
  const sheet1 = workbook.addWorksheet('フック50選');
  sheet1.columns = [
    { header: '順位', key: 'rank', width: 8 },
    { header: 'インプレッション', key: 'impressions', width: 15 },
    { header: '1行目フック', key: 'hook', width: 80 },
  ];

  // ヘッダースタイル
  sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

  hooks.forEach((h, i) => {
    const row = sheet1.addRow(h);
    // TOP3をハイライト
    if (i < 3) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    }
  });

  // シート2: フックテンプレート（穴埋め形式）
  const sheet2 = workbook.addWorksheet('フックテンプレート');
  sheet2.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'パターン名', key: 'pattern', width: 20 },
    { header: 'テンプレート', key: 'template', width: 60 },
    { header: '使用例', key: 'example', width: 60 },
  ];

  sheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

  const templates = [
    { no: 1, pattern: '損失回避型', template: '{プラットフォーム}で{行動}してる人、マジで損してます。', example: 'Threadsで短文投稿してる人、マジで損してます。' },
    { no: 2, pattern: '間違い指摘型', template: '{分野}の{要素}、{割合}の人が間違ってます。', example: 'Threadsの投稿時間、9割の人が間違ってます。' },
    { no: 3, pattern: '時代遅れ型', template: 'まだ{古い方法}してる人、完全に時代遅れです。', example: 'まだThreadsで1日1投稿してる人、完全に時代遅れです。' },
    { no: 4, pattern: '速報・発見型', template: '【速報】{分野}で{発見内容}が判明したので、報告します。', example: '【速報】Threadsで伸びる文章構成が判明したので、報告します。' },
    { no: 5, pattern: '警告型', template: '{プラットフォーム}で{行動}してる人、伸びません。', example: 'Threadsで絵文字つけまくってる人、伸びません。' },
    { no: 6, pattern: 'NG提示型', template: 'あのー、{プラットフォーム}で{行動}はしない方がいいですよ。', example: 'あのー、Threads投稿する時にトピックは設定しない方がいいですよ。' },
    { no: 7, pattern: '逆効果型', template: '{一般的な行動}してる人、完全に逆効果です。', example: 'Threadsで改行すればするほど見やすくなるって思ってる人、完全に逆効果です。' },
    { no: 8, pattern: '共通点発見型', template: '{成功/失敗事例}を分析したら{数}つの共通点がありました。', example: '10,000imp超える投稿を分析したら7つの共通点がありました。' },
    { no: 9, pattern: '質問型', template: '{意外な事実}って知ってました？', example: 'Threadsは「お得系」より「損失系」の訴求が7.3倍伸びやすいって知ってました？' },
    { no: 10, pattern: '緊急型', template: '【緊急】{問題}、{対象者}は今すぐ確認してください。', example: '【緊急】Threadsの箇条書き、9割の人が間違ってます。' },
  ];

  templates.forEach(t => sheet2.addRow(t));

  // シート3: フック構成要素
  const sheet3 = workbook.addWorksheet('フック構成要素');
  sheet3.columns = [
    { header: '要素', key: 'element', width: 20 },
    { header: '例', key: 'examples', width: 80 },
  ];

  sheet3.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet3.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

  const elements = [
    { element: '危機感ワード', examples: 'マジで損してます / 完全に時代遅れです / 伸びません / 逆効果です / 終わります' },
    { element: '強調ワード', examples: 'マジで / 完全に / 絶対に / 今すぐ / 緊急' },
    { element: '数字表現', examples: '9割の人 / 〇〇件分析 / 〇倍変わる / 〇つの共通点 / 〇ヶ月で〇名増' },
    { element: '対象者指定', examples: '〇〇してる人 / 〇〇な人 / フォロワー〇名以下の人 / 初心者の人' },
    { element: 'プラットフォーム', examples: 'Threads / Instagram / Twitter / LINE / YouTube' },
    { element: '行動・状態', examples: '短文投稿 / 1日1投稿 / 深夜投稿 / 絵文字多用 / トピック設定' },
  ];

  elements.forEach(e => sheet3.addRow(e));

  const outputPath = path.join(process.env.HOME || '/tmp', 'Downloads', 'threads_hook_50.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`\n保存完了: ${outputPath}`);
}

main().catch(console.error);
