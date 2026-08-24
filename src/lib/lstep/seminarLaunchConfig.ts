import { readFile } from 'node:fs/promises';
import { Storage } from '@google-cloud/storage';

export interface SeminarFlexTemplateConfig {
  id: number;
  label: string;
  count: number;
  startsTomorrow?: boolean;
}

export interface SeminarLaunchConfig {
  schemaVersion: 1;
  launchId: string;
  enabled: boolean;
  window: { startDate: string; endDate: string } | null;
  schedule: {
    timeZone: string;
    slotHours: number[];
    runHours: number[];
  };
  reminder: {
    prefix: string;
    goalTime: string;
  };
  targets: {
    tagGroupName: string;
    form: { id: number; groupId: number; choiceSelector: string };
    dateTemplateId: number;
    reminderTemplate: { id: number; groupId: number };
    flexTemplates: SeminarFlexTemplateConfig[];
    oneTapTagId: number;
  };
  counts: {
    form: number;
    dateTemplate: number;
    reminder: number;
  };
  immutableActionPrefix: string;
}

export type LaunchRunState = {
  runnable: boolean;
  reason: 'ready' | 'disabled' | 'before_window' | 'after_window';
};

export interface LoadSeminarLaunchConfigOptions {
  localPath?: string;
  bucketName?: string;
  objectName?: string;
  storage?: Storage;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const DEFAULT_SEMINAR_LAUNCH_CONFIG_OBJECT = 'lstep/config/seminar-launch.json';

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} はオブジェクトで指定してください`);
  }
  return value as Record<string, unknown>;
}

function textValue(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} は空にできません`);
  return value.trim();
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${path} は正の整数で指定してください`);
  return Number(value);
}

function hourList(value: unknown, path: string): number[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${path} は1件以上の時刻を指定してください`);
  const hours = value.map((hour, index) => {
    if (!Number.isInteger(hour) || Number(hour) < 0 || Number(hour) > 23) {
      throw new Error(`${path}[${index}] は0〜23の整数で指定してください`);
    }
    return Number(hour);
  });
  if (new Set(hours).size !== hours.length) throw new Error(`${path} に重複があります`);
  return hours;
}

function dateValue(value: unknown, path: string): string {
  const date = textValue(value, path);
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error(`${path} はYYYY-MM-DD形式で指定してください`);
  }
  return date;
}

function timeZoneValue(value: unknown, path: string): string {
  const timeZone = textValue(value, path);
  try {
    new Intl.DateTimeFormat('ja-JP', { timeZone }).format(new Date());
  } catch {
    throw new Error(`${path} は有効なIANAタイムゾーンで指定してください`);
  }
  return timeZone;
}

export function parseSeminarLaunchConfig(value: unknown): SeminarLaunchConfig {
  const root = record(value, 'config');
  if (root.schemaVersion !== 1) throw new Error('schemaVersion は1を指定してください');
  if (typeof root.enabled !== 'boolean') throw new Error('enabled はtrueまたはfalseで指定してください');

  const schedule = record(root.schedule, 'schedule');
  const slotHours = hourList(schedule.slotHours, 'schedule.slotHours');
  const runHours = hourList(schedule.runHours, 'schedule.runHours');
  const expectedRunHours = slotHours.map((hour) => (hour + 23) % 24);
  if (JSON.stringify(runHours) !== JSON.stringify(expectedRunHours)) {
    throw new Error(`schedule.runHours はslotHoursの1時間前を同じ順番で指定してください（期待: ${expectedRunHours.join(',')}）`);
  }

  let window: SeminarLaunchConfig['window'] = null;
  if (root.window !== null && root.window !== undefined) {
    const windowValue = record(root.window, 'window');
    const startDate = dateValue(windowValue.startDate, 'window.startDate');
    const endDate = dateValue(windowValue.endDate, 'window.endDate');
    if (startDate > endDate) throw new Error('window.endDate はstartDate以降を指定してください');
    window = { startDate, endDate };
  }
  if (root.enabled && !window) throw new Error('enabled=true にする前にwindowを設定してください');

  const reminder = record(root.reminder, 'reminder');
  const goalTime = textValue(reminder.goalTime, 'reminder.goalTime');
  if (!TIME_RE.test(goalTime)) throw new Error('reminder.goalTime はHH:mm形式で指定してください');

  const targets = record(root.targets, 'targets');
  const form = record(targets.form, 'targets.form');
  const reminderTemplate = record(targets.reminderTemplate, 'targets.reminderTemplate');
  if (!Array.isArray(targets.flexTemplates) || targets.flexTemplates.length === 0) {
    throw new Error('targets.flexTemplates は1件以上指定してください');
  }
  const flexTemplates = targets.flexTemplates.map((item, index) => {
    const flex = record(item, `targets.flexTemplates[${index}]`);
    if (flex.startsTomorrow !== undefined && typeof flex.startsTomorrow !== 'boolean') {
      throw new Error(`targets.flexTemplates[${index}].startsTomorrow はtrueまたはfalseで指定してください`);
    }
    return {
      id: positiveInteger(flex.id, `targets.flexTemplates[${index}].id`),
      label: textValue(flex.label, `targets.flexTemplates[${index}].label`),
      count: positiveInteger(flex.count, `targets.flexTemplates[${index}].count`),
      ...(flex.startsTomorrow === true ? { startsTomorrow: true } : {}),
    };
  });
  const flexIds = flexTemplates.map((template) => template.id);
  if (new Set(flexIds).size !== flexIds.length) throw new Error('targets.flexTemplates.id に重複があります');

  const counts = record(root.counts, 'counts');
  const config: SeminarLaunchConfig = {
    schemaVersion: 1,
    launchId: textValue(root.launchId, 'launchId'),
    enabled: root.enabled,
    window,
    schedule: {
      timeZone: timeZoneValue(schedule.timeZone, 'schedule.timeZone'),
      slotHours,
      runHours,
    },
    reminder: {
      prefix: textValue(reminder.prefix, 'reminder.prefix'),
      goalTime,
    },
    targets: {
      tagGroupName: textValue(targets.tagGroupName, 'targets.tagGroupName'),
      form: {
        id: positiveInteger(form.id, 'targets.form.id'),
        groupId: positiveInteger(form.groupId, 'targets.form.groupId'),
        choiceSelector: textValue(form.choiceSelector, 'targets.form.choiceSelector'),
      },
      dateTemplateId: positiveInteger(targets.dateTemplateId, 'targets.dateTemplateId'),
      reminderTemplate: {
        id: positiveInteger(reminderTemplate.id, 'targets.reminderTemplate.id'),
        groupId: positiveInteger(reminderTemplate.groupId, 'targets.reminderTemplate.groupId'),
      },
      flexTemplates,
      oneTapTagId: positiveInteger(targets.oneTapTagId, 'targets.oneTapTagId'),
    },
    counts: {
      form: positiveInteger(counts.form, 'counts.form'),
      dateTemplate: positiveInteger(counts.dateTemplate, 'counts.dateTemplate'),
      reminder: positiveInteger(counts.reminder, 'counts.reminder'),
    },
    immutableActionPrefix: textValue(root.immutableActionPrefix, 'immutableActionPrefix'),
  };

  return config;
}

function dateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function launchRunState(config: SeminarLaunchConfig, now: Date): LaunchRunState {
  if (!config.enabled) return { runnable: false, reason: 'disabled' };
  if (!config.window) return { runnable: false, reason: 'disabled' };
  const today = dateInTimeZone(now, config.schedule.timeZone);
  if (today < config.window.startDate) return { runnable: false, reason: 'before_window' };
  if (today > config.window.endDate) return { runnable: false, reason: 'after_window' };
  return { runnable: true, reason: 'ready' };
}

export async function loadSeminarLaunchConfig(
  options: LoadSeminarLaunchConfigOptions = {},
): Promise<SeminarLaunchConfig> {
  const localPath = options.localPath ?? process.env.LSTEP_SEMINAR_LAUNCH_CONFIG_PATH;
  if (localPath) {
    return parseSeminarLaunchConfig(JSON.parse(await readFile(localPath, 'utf8')));
  }

  const bucketName = options.bucketName ?? process.env.LSTEP_GCS_BUCKET;
  const objectName = options.objectName ?? process.env.LSTEP_SEMINAR_LAUNCH_CONFIG_OBJECT ?? DEFAULT_SEMINAR_LAUNCH_CONFIG_OBJECT;
  if (!bucketName) throw new Error('LSTEPセミナーローンチ設定のGCS bucketが未指定です');
  const storage = options.storage ?? new Storage();
  const [contents] = await storage.bucket(bucketName).file(objectName).download();
  return parseSeminarLaunchConfig(JSON.parse(contents.toString('utf8')));
}

export function formatSeminarLaunchConfigSummary(config: SeminarLaunchConfig): string {
  const window = config.window ? `${config.window.startDate}〜${config.window.endDate}` : '未設定';
  return [
    `launchId: ${config.launchId}`,
    `enabled: ${config.enabled}`,
    `window: ${window}`,
    `slots: ${config.schedule.slotHours.join(',')}時`,
    `runs: ${config.schedule.runHours.join(',')}時 (${config.schedule.timeZone})`,
    `scheduler cron: 0 ${config.schedule.runHours.join(',')} * * *`,
    `form: ${config.targets.form.id}`,
    `flex: ${config.targets.flexTemplates.map((item) => item.id).join(',')}`,
    `dateTemplate: ${config.targets.dateTemplateId}`,
    `reminderTemplate: ${config.targets.reminderTemplate.id}`,
  ].join('\n');
}
