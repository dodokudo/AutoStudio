import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  cloneInputsForDateTag,
  rebuildDateButtons,
  dateButtonId,
  formActionCorrect,
  dateTagHour,
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

test('9月の複製では日付と時間帯タグを同時に更新し、配信・条件を保持する', () => {
  const source: LstepAction = { aid: 1, inputs: [
    { type: 5, scenario_id: 1276566, member_query_id: 8 },
    { type: 12, template_id: 280160560, member_query_id: 9 },
    { type: 13, tag_ids: [10463640, 10463642, 111, 10475319], member_query_id: 9 },
  ] };
  const next = cloneInputsForDateTag(source, new Set([111, 222]), 222, { knownIds: [10475319, 10475320, 10475321], nextId: 10475321 });
  assert.deepEqual(next[2].tag_ids, [10463640, 10463642, 222, 10475321]);
  assert.deepEqual(next.slice(0,2), source.inputs?.slice(0,2));
  assert.deepEqual(source.inputs?.[2].tag_ids, [10463640, 10463642, 111, 10475319]);
  assert.throws(() => cloneInputsForDateTag(source, new Set([111]), 222, { knownIds: [999], nextId: 10475320 }), /時間帯タグが0件/);
});


test('表示タグだけが正しく、友だち情報の代入値が別時間なら検証を通さない', async () => {
  const config = parseSeminarLaunchConfig(JSON.parse(await readFile('deploy/lstep-seminar/launch-config.september-auto.json', 'utf8')));
  const { buildSlot } = await import('./seminarSchedule');
  const slot = buildSlot(new Date(2026, 8, 15), 10, { dateTagPrefix: config.targets.dateTagPrefix });
  const tag = { name: slot.tagName, href: '/line/tag/setting/1', memberCount: 0, summary: '' };
  const text = `${slot.tagName} 【2026.9オート】10時回申込`;
  assert.equal(formActionCorrect(`${text} __APPLICATION_VALUE=9/15(火)20:00~__`, slot, tag, config), false);
  assert.equal(formActionCorrect(`${text} __APPLICATION_VALUE=9/15(火)10:00~__`, slot, tag, config), true);
  assert.equal(dateTagHour(slot.tagName), 10);
  assert.equal(dateTagHour('9月15日13時'), 13);
});


test('期限切れボタンを除外し、新日程は新しいIDで追加、既存枠と案内ボタンを保持する', () => {
  const label = (day: number) => `9/${day}(土)10:00~`;
  const block = (day: number, aid: number) => ({ id: dateButtonId('123', label(day), aid), type: 'button',
    text: { type: 'doc', content: [{ type: 'text', text: label(day) }] },
    action: { data: { act: { aid, description: 'old' } }, description: 'old' } });
  const before = [{ id: 'heading', text: { text: '案内' } }, block(12, 100), block(13, 101), { id: 'form-link', action: { url: 'unchanged' } }];
  const snapshot = structuredClone(before);
  const after = rebuildDateButtons(before, '123', [label(13), label(14)], [{ actionId: 101, actionDescription: 'old' }, { actionId: 102, actionDescription: 'new' }]);
  assert.deepEqual(before, snapshot);
  assert.deepEqual(after[0], before[0]);
  assert.deepEqual(after[1], before[2]);
  assert.deepEqual(after[3], before[3]);
  assert.equal(after.some((b) => b.id === before[1].id), false);
  assert.equal(after[2].id, dateButtonId('123', label(14), 102));
  assert.notEqual(after[2].id, before[2].id);
  assert.equal((after[2].action as {data:{act:{aid:number}}}).data.act.aid, 102);
  assert.deepEqual(rebuildDateButtons(after, '123', [label(13), label(14)], [{actionId:101,actionDescription:'old'},{actionId:102,actionDescription:'new'}]), after);
});

test('旧方式のボタンは表示が同じでも新しいボタンIDへ移行する', () => {
  const before = [{ id: 'bl1234', text: { type: 'doc', content: [{text:'9/12(土)10:00~'}] }, action: { data: {act: {aid:100}} } }];
  const next = rebuildDateButtons(before, '123', ['9/12(土)10:00~'], [{actionId:100,actionDescription:'same action'}]);
  assert.notEqual(next[0].id, before[0].id);
  assert.equal((next[0].action as {data:{act:{aid:number}}}).data.act.aid, 100);
});
