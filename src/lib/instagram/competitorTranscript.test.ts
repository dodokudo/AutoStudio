import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCompetitorReelChapters,
  deriveCompetitorReelHook,
  deriveCompetitorReelTitle,
  formatCompetitorTranscriptSegments,
} from './competitorTranscript';

const segments = [
  { start: 0, end: 12, text: 'インスタで伸びない人は最初の3秒を間違えています。' },
  { start: 12, end: 25, text: '理由は、視聴者が続きを見る価値を判断するからです。' },
  { start: 25, end: 39, text: 'まず冒頭で得られる結果を伝えてください。' },
  { start: 39, end: 55, text: '最後にプロフィールから資料を受け取ってください。' },
];

test('derives a compact reel title from the spoken opening', () => {
  assert.equal(deriveCompetitorReelTitle(segments), 'インスタで伸びない人は最初の3秒を間違えています');
});

test('builds timestamped chapters covering the full transcript', () => {
  const chapters = buildCompetitorReelChapters(segments);
  assert.ok(chapters.length >= 2);
  assert.equal(chapters[0]?.start, 0);
  assert.equal(chapters[0]?.kind, 'hook');
  assert.match(chapters[0]?.title ?? '', /^冒頭フック：/);
  assert.equal(chapters.at(-1)?.end, 55);
  assert.ok(chapters.every((chapter) => chapter.title.length > 0 && chapter.end > chapter.start));
});

test('turns an AI comparison opening into a useful title', () => {
  assert.equal(deriveCompetitorReelTitle([
    { start: 0, end: 5, text: 'Gemini 画像生成 ChatGPT' },
    { start: 5, end: 9, text: 'おすすめのAI Claude' },
  ]), 'ChatGPT・Gemini・Claude、おすすめAIを比較');
});

test('uses the spoken script instead of a long caption for the title', () => {
  assert.equal(deriveCompetitorReelTitle([
    { start: 0, end: 8, text: 'リールが伸びない原因は投稿時間ではありません。' },
  ], 'これは表示に使わない長いキャプションです。詳細はプロフィールから確認してください。'), 'リールが伸びない原因は投稿時間ではありません');
});

test('classifies the first five seconds as overlapping hook techniques', () => {
  const hook = deriveCompetitorReelHook([
    { start: 0, end: 3, text: '今日公式発表で、リールが100再生で止まります。' },
    { start: 3, end: 7, text: '知らない人は必ず確認してください。' },
  ]);
  assert.match(hook.text, /公式発表/);
  assert.deepEqual(hook.labels, ['数字・成果', '新情報', '危機・否定']);
});

test('restores readable punctuation without splitting a continuing phrase', () => {
  const formatted = formatCompetitorTranscriptSegments([
    { start: 0, end: 2.3, text: 'インスタ有料化しまして完全終了になります' },
    { start: 2.3, end: 4.96, text: '月額で319円払えば超優遇されるようになり' },
    { start: 4.96, end: 7.68, text: '無課金勢は完全に終了してアカウント終わります' },
    { start: 8.34, end: 10.14, text: 'って思うんですがこれは当然です' },
    { start: 10.14, end: 12.14, text: 'インスタ側からしたら課金してまでも伸ばして' },
  ]);

  assert.equal(formatted[0]?.text, 'インスタ有料化しまして完全終了になります。');
  assert.equal(formatted[1]?.text, '月額で319円払えば超優遇されるようになり無課金勢は完全に終了してアカウント終わりますって思うんですが、これは当然です。');
  assert.equal(formatted[2]?.text, 'インスタ側からしたら課金してまでも伸ばして。');
});
