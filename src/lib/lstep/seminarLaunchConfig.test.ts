import assert from 'node:assert/strict';
import test from 'node:test';
import {
  launchRunState,
  parseSeminarLaunchConfig,
  type SeminarLaunchConfig,
} from './seminarLaunchConfig';

const validConfig: SeminarLaunchConfig = {
  schemaVersion: 1,
  launchId: '2026-09-seminar',
  enabled: true,
  window: { startDate: '2026-09-08', endDate: '2026-09-30' },
  schedule: {
    timeZone: 'Asia/Tokyo',
    slotHours: [13, 21],
    runHours: [12, 20],
  },
  reminder: { prefix: '【2026.9】', goalTime: '22:00' },
  targets: {
    tagGroupName: '回答フォーム 用日程',
    form: { id: 1_084_212, groupId: 216_354, choiceSelector: '#radio_3' },
    dateTemplateId: 268_609_107,
    reminderTemplate: { id: 268_822_941, groupId: 1_020_108 },
    flexTemplates: [
      { id: 268_607_623, label: '2日後07:08', count: 6 },
      { id: 268_608_656, label: '8日後20:03', count: 2, startsTomorrow: true },
    ],
    oneTapTagId: 10_242_626,
  },
  counts: { form: 14, dateTemplate: 6, reminder: 8 },
  immutableActionPrefix: 'AUTO_2026_09_セミナー申込_',
};

test('accepts a complete reusable seminar launch config', () => {
  const parsed = parseSeminarLaunchConfig(validConfig);

  assert.equal(parsed.launchId, '2026-09-seminar');
  assert.deepEqual(parsed.schedule.slotHours, [13, 21]);
  assert.equal(parsed.targets.flexTemplates[1].startsTomorrow, true);
});

test('rejects a scheduler hour that is not one hour before its slot', () => {
  assert.throws(
    () => parseSeminarLaunchConfig({
      ...validConfig,
      schedule: { ...validConfig.schedule, runHours: [11, 20] },
    }),
    /runHours.*slotHours/,
  );
});

test('requires an execution window before a launch can be enabled', () => {
  assert.throws(
    () => parseSeminarLaunchConfig({ ...validConfig, window: null }),
    /window/,
  );
});

test('rejects an invalid time zone before deployment', () => {
  assert.throws(
    () => parseSeminarLaunchConfig({
      ...validConfig,
      schedule: { ...validConfig.schedule, timeZone: 'JST-ish' },
    }),
    /IANA/,
  );
});

test('gates execution when paused or outside the launch window', () => {
  assert.deepEqual(
    launchRunState(parseSeminarLaunchConfig({ ...validConfig, enabled: false, window: null }), new Date('2026-09-10T03:00:00Z')),
    { runnable: false, reason: 'disabled' },
  );
  assert.deepEqual(
    launchRunState(parseSeminarLaunchConfig(validConfig), new Date('2026-09-07T03:00:00Z')),
    { runnable: false, reason: 'before_window' },
  );
  assert.deepEqual(
    launchRunState(parseSeminarLaunchConfig(validConfig), new Date('2026-10-01T03:00:00Z')),
    { runnable: false, reason: 'after_window' },
  );
  assert.deepEqual(
    launchRunState(parseSeminarLaunchConfig(validConfig), new Date('2026-09-10T03:00:00Z')),
    { runnable: true, reason: 'ready' },
  );
});
