import assert from 'node:assert/strict';
import test from 'node:test';
import { replaceReminderDateBlock } from './seminarSlotRunner';

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
