import assert from 'node:assert/strict';
import test from 'node:test';
import { slotToRemoveAt, slotsFromTomorrow, upcomingSlots } from './seminarSchedule';

test('16時時点では当日21時枠を残し、日時を6枠返す', () => {
  const slots = upcomingSlots(new Date(2026, 6, 22, 16, 0), 6);
  assert.deepEqual(slots.map((slot) => slot.choiceLabel), [
    '7/22(水) 21:00~',
    '7/23(木) 13:00~',
    '7/23(木) 21:00~',
    '7/24(金) 13:00~',
    '7/24(金) 21:00~',
    '7/25(土) 13:00~',
  ]);
});

test('19時59分までは当日21時枠を残す', () => {
  const slots = upcomingSlots(new Date(2026, 6, 22, 19, 59), 1);
  assert.equal(slots[0].choiceLabel, '7/22(水) 21:00~');
});

test('20時実行では当日21時枠を削除して次の6枠へ進める', () => {
  const slots = upcomingSlots(new Date(2026, 6, 22, 20, 0), 6);
  assert.deepEqual(slots.map((slot) => slot.choiceLabel), [
    '7/23(木) 13:00~',
    '7/23(木) 21:00~',
    '7/24(金) 13:00~',
    '7/24(金) 21:00~',
    '7/25(土) 13:00~',
    '7/25(土) 21:00~',
  ]);
});

test('追加シナリオ用は実行時刻に関係なく明日から6枠を返す', () => {
  const expected = [
    '7/24(金) 13:00~',
    '7/24(金) 21:00~',
    '7/25(土) 13:00~',
    '7/25(土) 21:00~',
    '7/26(日) 13:00~',
    '7/26(日) 21:00~',
  ];
  assert.deepEqual(slotsFromTomorrow(new Date(2026, 6, 23, 12, 0), 6).map((slot) => slot.choiceLabel), expected);
  assert.deepEqual(slotsFromTomorrow(new Date(2026, 6, 23, 20, 0), 6).map((slot) => slot.choiceLabel), expected);
});

test('7日後は明日から4枠、8日後は明日の2枠に絞る', () => {
  const now = new Date(2026, 6, 23, 20, 3);
  assert.deepEqual(slotsFromTomorrow(now, 4).map((slot) => slot.choiceLabel), [
    '7/24(金) 13:00~',
    '7/24(金) 21:00~',
    '7/25(土) 13:00~',
    '7/25(土) 21:00~',
  ]);
  assert.deepEqual(slotsFromTomorrow(now, 2).map((slot) => slot.choiceLabel), [
    '7/24(金) 13:00~',
    '7/24(金) 21:00~',
  ]);
});

test('ローンチ設定で開催時刻とリマインダ名を差し替えられる', () => {
  const options = { slotHours: [14, 19], reminderPrefix: '【2026.9】' };
  const slots = upcomingSlots(new Date(2026, 8, 8, 12, 0), 3, options);
  assert.deepEqual(slots.map((slot) => [slot.choiceLabel, slot.reminderName]), [
    ['9/8(火) 14:00~', '【2026.9】14時回'],
    ['9/8(火) 19:00~', '【2026.9】19時回'],
    ['9/9(水) 14:00~', '【2026.9】14時回'],
  ]);
  assert.equal(slotToRemoveAt(new Date(2026, 8, 8, 13, 0), options)?.choiceLabel, '9/8(火) 14:00~');
});
