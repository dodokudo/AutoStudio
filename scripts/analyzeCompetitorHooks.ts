#!/usr/bin/env ts-node

/**
 * 競合者のフック分析スクリプト
 * 門口さんとスギさんのTOP20投稿の冒頭フックを深く分析
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CompetitorPost {
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  saves: number;
  category: string;
  content: string;
  isWinner: boolean;
  date?: string;
}

interface HookAnalysis {
  competitor: string;
  rank: number;
  impressions: number;
  category: string;
  firstLine: string;
  firstLineLength: number;
  fullContent: string;
  hookPattern: string;
  emotionalTrigger: string[];
  structuralElements: {
    hasWarning: boolean;
    hasNumber: boolean;
    hasQuestion: boolean;
    hasEmoji: boolean;
    hasQuote: boolean;
    hasAuthority: boolean;
    hasNegation: boolean;
    hasTimeConstraint: boolean;
  };
}

function extractFirstLine(content: string): string {
  // Remove markdown formatting
  let cleaned = content.replace(/\*\*/g, '');

  // Split by line breaks
  const lines = cleaned.split(/\n+/);

  // Return first non-empty line
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return '';
}

function analyzeHookPattern(firstLine: string): string {
  // Identify the hook construction pattern

  // Warning pattern: 〜終了/終わります/危険/注意
  if (/終了|終わり|危険|注意|NG|やめて|ダメ/.test(firstLine)) {
    if (/してる人|してるアカウント/.test(firstLine)) {
      return '警告型（対象者特定）: "[行動]してる人、[結果]"';
    }
    return '警告型（一般）: "[状況]、[警告]"';
  }

  // Authority pattern: metaから/公式/発表
  if (/meta|公式|発表|通知|アナウンス/.test(firstLine)) {
    return '権威型: "[権威ソース]から[情報]"';
  }

  // Emotional negative: 大嫌い/嫌い/イライラ
  if (/大嫌い|嫌い|イライラ|むかつく|腹立つ/.test(firstLine)) {
    return '感情型（ネガティブ）: "私の[強い感情]な[対象]"';
  }

  // Story/confession: 〜しました/〜になりました
  if (/なりました|しました|辞めました|始めました/.test(firstLine)) {
    return 'ストーリー型: "[主語]は[出来事]"';
  }

  // Number/data: 数字が含まれる
  if (/\d+/.test(firstLine)) {
    return 'データ型: "[数字]の[事実/結果]"';
  }

  // Question: 疑問形
  if (/？|\?|ですか|かな|でしょうか/.test(firstLine)) {
    return '質問型: "[問いかけ]"';
  }

  // Value proposition: 〜方法/〜コツ
  if (/方法|コツ|秘訣|ポイント/.test(firstLine)) {
    return '価値提示型: "[結果]の[方法/コツ]"';
  }

  // Contrast: 〜じゃない/違う
  if (/じゃない|違う|実は|本当は/.test(firstLine)) {
    return '対比型: "[一般認識]じゃない、[真実]"';
  }

  return 'その他';
}

function identifyEmotionalTriggers(content: string, firstLine: string): string[] {
  const triggers: string[] = [];

  // Urgency/FOMO
  if (/終了|終わり|今すぐ|急いで|まもなく|期限/.test(firstLine)) {
    triggers.push('緊急性・FOMO');
  }

  // Fear/Loss aversion
  if (/危険|注意|損|失敗|NG|やめて|ダメ/.test(firstLine)) {
    triggers.push('恐怖・損失回避');
  }

  // Authority
  if (/meta|公式|発表|通知|専門|プロ/.test(content)) {
    triggers.push('権威性');
  }

  // Social proof
  if (/\d+人|みんな|多くの|バズった|伸びた/.test(content)) {
    triggers.push('社会的証明');
  }

  // Curiosity gap
  if (/実は|意外|知らない|秘密|裏技/.test(content)) {
    triggers.push('好奇心ギャップ');
  }

  // Anger/Frustration
  if (/嫌い|イライラ|むかつく|腹立つ/.test(firstLine)) {
    triggers.push('怒り・不満');
  }

  // Empathy/Story
  if (/私|僕|我が家|パパ|ママ/.test(firstLine)) {
    triggers.push('共感・ストーリー');
  }

  // Value/Benefit
  if (/増える|伸びる|稼げる|できる|簡単/.test(content)) {
    triggers.push('価値・ベネフィット');
  }

  return triggers.length > 0 ? triggers : ['なし'];
}

function analyzeStructure(content: string, firstLine: string) {
  return {
    hasWarning: /終了|終わり|危険|注意|NG|やめて|ダメ/.test(firstLine),
    hasNumber: /\d+/.test(firstLine),
    hasQuestion: /？|\?|ですか|かな|でしょうか/.test(firstLine),
    hasEmoji: /[\u{1F000}-\u{1F9FF}]/u.test(firstLine),
    hasQuote: /「|」|『|』/.test(firstLine),
    hasAuthority: /meta|公式|発表|通知/.test(content),
    hasNegation: /じゃない|違う|ない|NG/.test(firstLine),
    hasTimeConstraint: /今|すぐ|まもなく|期限/.test(firstLine),
  };
}

function analyzeCompetitor(name: string, filePath: string): HookAnalysis[] {
  const content = readFileSync(filePath, 'utf-8');
  const posts: CompetitorPost[] = JSON.parse(content);

  // Sort by impressions and take TOP 20
  const top20 = posts
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  return top20.map((post, index) => {
    const firstLine = extractFirstLine(post.content);

    return {
      competitor: name,
      rank: index + 1,
      impressions: post.impressions,
      category: post.category,
      firstLine,
      firstLineLength: firstLine.length,
      fullContent: post.content,
      hookPattern: analyzeHookPattern(firstLine),
      emotionalTrigger: identifyEmotionalTriggers(post.content, firstLine),
      structuralElements: analyzeStructure(post.content, firstLine),
    };
  });
}

// Main execution
const monoguchAnalysis = analyzeCompetitor(
  '門口さん',
  resolve(__dirname, '../analysis/competitors/monoguchi/posts.json')
);

const sugiAnalysis = analyzeCompetitor(
  'スギさん',
  resolve(__dirname, '../analysis/competitors/sugi/posts.json')
);

// Output results
console.log('=== 門口さん TOP 20 フック分析 ===\n');
monoguchAnalysis.forEach((item) => {
  console.log(`【${item.rank}位】${item.impressions.toLocaleString()}imp - ${item.category}`);
  console.log(`冒頭: ${item.firstLine}`);
  console.log(`文字数: ${item.firstLineLength}文字`);
  console.log(`パターン: ${item.hookPattern}`);
  console.log(`感情トリガー: ${item.emotionalTrigger.join(', ')}`);
  console.log(`構造要素: ${Object.entries(item.structuralElements).filter(([k, v]) => v).map(([k]) => k).join(', ')}`);
  console.log('');
});

console.log('\n=== スギさん TOP 20 フック分析 ===\n');
sugiAnalysis.forEach((item) => {
  console.log(`【${item.rank}位】${item.impressions.toLocaleString()}imp - ${item.category}`);
  console.log(`冒頭: ${item.firstLine}`);
  console.log(`文字数: ${item.firstLineLength}文字`);
  console.log(`パターン: ${item.hookPattern}`);
  console.log(`感情トリガー: ${item.emotionalTrigger.join(', ')}`);
  console.log(`構造要素: ${Object.entries(item.structuralElements).filter(([k, v]) => v).map(([k]) => k).join(', ')}`);
  console.log('');
});

// Pattern frequency analysis
console.log('\n=== パターン出現頻度 ===\n');

function countPatterns(analysis: HookAnalysis[]) {
  const patterns: Record<string, number> = {};
  const triggers: Record<string, number> = {};

  analysis.forEach((item) => {
    patterns[item.hookPattern] = (patterns[item.hookPattern] || 0) + 1;
    item.emotionalTrigger.forEach((trigger) => {
      triggers[trigger] = (triggers[trigger] || 0) + 1;
    });
  });

  return { patterns, triggers };
}

const monoguchPatterns = countPatterns(monoguchAnalysis);
const sugiPatterns = countPatterns(sugiAnalysis);

console.log('【門口さん】');
console.log('フックパターン:');
Object.entries(monoguchPatterns.patterns)
  .sort(([, a], [, b]) => b - a)
  .forEach(([pattern, count]) => {
    console.log(`  ${pattern}: ${count}回 (${Math.round(count / 20 * 100)}%)`);
  });

console.log('\n感情トリガー:');
Object.entries(monoguchPatterns.triggers)
  .sort(([, a], [, b]) => b - a)
  .forEach(([trigger, count]) => {
    console.log(`  ${trigger}: ${count}回 (${Math.round(count / 20 * 100)}%)`);
  });

console.log('\n【スギさん】');
console.log('フックパターン:');
Object.entries(sugiPatterns.patterns)
  .sort(([, a], [, b]) => b - a)
  .forEach(([pattern, count]) => {
    console.log(`  ${pattern}: ${count}回 (${Math.round(count / 20 * 100)}%)`);
  });

console.log('\n感情トリガー:');
Object.entries(sugiPatterns.triggers)
  .sort(([, a], [, b]) => b - a)
  .forEach(([trigger, count]) => {
    console.log(`  ${trigger}: ${count}回 (${Math.round(count / 20 * 100)}%)`);
  });

// Save detailed analysis to JSON
const outputPath = resolve(__dirname, '../analysis/competitors/hook_analysis.json');
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      monoguchi: {
        posts: monoguchAnalysis,
        patterns: monoguchPatterns,
      },
      sugi: {
        posts: sugiAnalysis,
        patterns: sugiPatterns,
      },
    },
    null,
    2
  )
);

console.log(`\n詳細分析を保存しました: ${outputPath}`);
