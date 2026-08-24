import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  cloneInputsForDateTag,
  flexRotationPlan,
  replaceReminderDateBlock,
  runSeminarSchedule,
  tagIdFromHref,
  type LstepAction,
} from './seminarSlotRunner';
import { parseSeminarLaunchConfig } from './seminarLaunchConfig';

test('停止設定ではブラウザを開かず安全にskipする', async () => {
  const source = await readFile('deploy/lstep-seminar/launch-config.paused.json', 'utf8');
  const result = await runSeminarSchedule({
    apply: true,
    launchConfig: parseSeminarLaunchConfig(JSON.parse(source)),
  });
  assert.equal(result.steps[0].status, 'skipped');
  assert.match(result.steps[0].detail, /停止中/);
  assert.deepEqual(result.issues, []);
});

test('groupクエリ付きのタグURLからタグIDを取得する', () => {
  assert.equal(tagIdFromHref('/line/tag/setting/10222432?group=722246'), 10222432);
});

test('日程行だけを置換し、本文の改行を完全に保持する', () => {
  const before = [
    'まだ間に合います｜今から参加できます！',
    '',
    '[name]さん',
    'Threads完全攻略セミナーは、',
    'すでに開始しています！',
    '',
    '・7/22(水)21:00~',
    '・7/23(木)13:00~',
    '',
    'お申し込みいただいたので、',
    'できるだけセミナー内容を',
    '受け取っていただきたいです！',
  ].join('\n');

  const after = replaceReminderDateBlock(before, [
    '・7/23(木)13:00~',
    '・7/23(木)21:00~',
    '・7/24(金)13:00~',
  ]);

  assert.equal(after, [
    'まだ間に合います｜今から参加できます！',
    '',
    '[name]さん',
    'Threads完全攻略セミナーは、',
    'すでに開始しています！',
    '',
    '・7/23(木)13:00~',
    '・7/23(木)21:00~',
    '・7/24(金)13:00~',
    '',
    'お申し込みいただいたので、',
    'できるだけセミナー内容を',
    '受け取っていただきたいです！',
  ].join('\n'));
});

test('CRLFと日程ブロック前後の空行を保持する', () => {
  const before = '前半\r\n\r\n・7/22(水)21:00~\r\n・7/23(木)13:00~\r\n\r\n後半';
  const after = replaceReminderDateBlock(before, ['・7/23(木)21:00~']);
  assert.equal(after, '前半\r\n\r\n・7/23(木)21:00~\r\n\r\n後半');
});

test('ProseMirrorの段落間改行を維持して日程行だけを置換する', () => {
  const before = '前半\n\n・7/22(水)21:00~\n\n・7/23(木)13:00~\n\n後半';
  const after = replaceReminderDateBlock(before, ['・7/23(木)21:00~', '・7/24(金)13:00~']);
  assert.equal(after, '前半\n\n・7/23(木)21:00~\n\n・7/24(金)13:00~\n\n後半');
});

test('先頭の終了枠を削除し、新規枠をフォーム誘導の直前へ1件追加する', () => {
  assert.deepEqual(
    flexRotationPlan(
      ['7/26(日) 21:00~', '7/27(月) 13:00~', '7/27(月) 21:00~'],
      ['7/27(月) 13:00~', '7/27(月) 21:00~', '7/28(火) 13:00~'],
    ),
    { removeFromTop: 1, appendToBottom: 1 },
  );
});

test('表示枠が一致している場合はボタンを増減しない', () => {
  const labels = ['7/27(月) 13:00~', '7/27(月) 21:00~'];
  assert.deepEqual(
    flexRotationPlan(labels, labels),
    { removeFromTop: 0, appendToBottom: 0 },
  );
});

test('新規アクションの作成時にコピー元を変更せず日付タグだけ差し替える', () => {
  const source: LstepAction = {
    aid: 100,
    inputs: [
      { type: 9, scenario_id: 12, stop: true },
      { type: 2, template_id: 34, member_query_id: 56 },
      { type: 1, text: '日程変更をご希望でしょうか？', member_query_id: 78 },
      { type: 13, tag_ids: [10242626, 111, 10156329], member_query_id: 56 },
    ],
  };
  const copied = cloneInputsForDateTag(source, new Set([111, 222]), 222);

  assert.deepEqual((source.inputs?.[3].tag_ids), [10242626, 111, 10156329]);
  assert.deepEqual(copied[3].tag_ids, [10242626, 222, 10156329]);
  assert.deepEqual(copied.slice(0, 3), source.inputs?.slice(0, 3));
});
