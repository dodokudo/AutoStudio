import assert from 'node:assert/strict';
import test from 'node:test';
import iconv from 'iconv-lite';
import { transformLstepCsv } from './csvTransform';

test('keeps the exact Threads tags as separate tag rows', () => {
  const csv = [
    'ID,友だち追加日時,タグ_1,タグ_2,タグ_3',
    'ID,友だち追加日時,Threads,Threadsプロフ,Threads固定',
    'friend-1,2026-08-12 10:00:00,1,1,0',
    'friend-2,2026-08-12 11:00:00,0,1,1',
  ].join('\r\n');

  const result = transformLstepCsv(iconv.encode(csv, 'Shift_JIS'), '2026-08-12');
  const activeTags = result.userTags
    .filter((row) => row.tag_flag === 1)
    .map((row) => `${row.user_id}:${row.tag_name}`)
    .sort();

  assert.deepEqual(activeTags, [
    'friend-1:Threads',
    'friend-1:Threadsプロフ',
    'friend-2:Threadsプロフ',
    'friend-2:Threads固定',
  ]);
  assert.equal(
    result.userTags.filter((row) => row.tag_name === 'Threads' && row.tag_flag === 1).length,
    1,
  );
});

test('keeps the canonical Threads inflow tag from the latest YOKO export', () => {
  const csv = [
    '登録ID,,タグ_10338703,タグ_10338701,タグ_8112739,タグ_10396034',
    'ID,表示名,Threads：固定,Threads,Threads：プロフィール,【流入経路】Threads',
    'friend-1,登録者A,0,1,1,1',
    'friend-2,登録者B,0,0,1,0',
  ].join('\r\n');

  const result = transformLstepCsv(iconv.encode(csv, 'Shift_JIS'), '2026-09-20');
  const inflowRows = result.userTags.filter((row) => row.tag_name === '【流入経路】Threads');

  assert.deepEqual(
    inflowRows.map((row) => [row.user_id, row.tag_flag]),
    [
      ['friend-1', 1],
      ['friend-2', 0],
    ],
  );
});
