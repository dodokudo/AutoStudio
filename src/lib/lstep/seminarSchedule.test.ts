import assert from 'node:assert/strict';
import test from 'node:test';
import { upcomingSlots } from './seminarSchedule';

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
