import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';
import { ColumnDescriptor, ColumnCategory, NormalizedLstepData, UserCoreRow } from './types';

const CORE_FIELD_LABELS: Record<string, keyof UserCoreRow> = {
  ID: 'user_id',
  登録ID: 'user_id',
  表示名: 'display_name',
  '友だち追加日時': 'friend_added_at',
  ユーザーブロック: 'blocked',
  '最終メッセージ日時': 'last_msg_at',
  購読中シナリオ: 'scenario_name',
  シナリオ日数: 'scenario_days',
};

export function transformLstepCsv(buffer: Buffer, snapshotDate: string): NormalizedLstepData {
  const csvText = iconv.decode(buffer, 'Shift_JIS');
  const records: string[][] = parse(csvText, {
    relax_column_count: true,
    skip_empty_lines: false,
  });

  if (records.length < 3) {
    throw new Error('CSVの行数が不足しています（ヘッダー2行＋データ行が必要）');
  }

  const internalRow = records[0] ?? [];
  const labelRow = records[1] ?? [];
  const dataRows = records.slice(2);

  const columnDescriptors = buildColumnDescriptors(internalRow, labelRow);

  const normalized: NormalizedLstepData = {
    userCore: [],
    userTags: [],
    userSources: [],
    userSurveys: [],
  };

  for (const row of dataRows) {
    const values = columnDescriptors.map((descriptor, index) => normalizeValue(row[index]));

    const coreRow: UserCoreRow = {
      snapshot_date: snapshotDate,
      user_id: '',
      display_name: null,
      friend_added_at: null,
      blocked: null,
      last_msg_at: null,
      scenario_name: null,
      scenario_days: null,
    };

    columnDescriptors.forEach((descriptor, index) => {
      const value = values[index];
      switch (descriptor.category) {
        case 'core':
          if (descriptor.coreField) {
            assignCoreField(coreRow, descriptor.coreField, value);
          }
          break;
        case 'tag':
          if (!coreRow.user_id) {
            break;
          }
          normalized.userTags.push({
            snapshot_date: snapshotDate,
            user_id: coreRow.user_id,
            tag_id: descriptor.internalId ?? buildFallbackTagId(descriptor, index),
            tag_name: descriptor.label ?? descriptor.internalId ?? `タグ${index}`,
            tag_flag: parseFlag(value),
          });
          break;
        case 'source':
          if (!coreRow.user_id || !descriptor.label) {
            break;
          }
          normalized.userSources.push({
            snapshot_date: snapshotDate,
            user_id: coreRow.user_id,
            source_name: stripPrefix(descriptor.label, /^流入経路[:：]\s*/),
            source_flag: parseFlag(value),
          });
          break;
        case 'survey':
          if (!coreRow.user_id || !descriptor.label) {
            break;
          }
          normalized.userSurveys.push({
            snapshot_date: snapshotDate,
            user_id: coreRow.user_id,
            question: stripPrefix(descriptor.label, /^アンケート[:：]\s*/),
            answer_flag: parseFlag(value),
          });
          break;
        case 'other':
        default:
          break;
      }
    });

    if (!coreRow.user_id) {
      continue;
    }

    normalized.userCore.push(coreRow);
  }

  return normalized;
}

function buildColumnDescriptors(internalRow: string[], labelRow: string[]): ColumnDescriptor[] {
  const maxLength = Math.max(internalRow.length, labelRow.length);

  return Array.from({ length: maxLength }, (_, index): ColumnDescriptor => {
    const internalId = normalizeValue(internalRow[index]);
    const label = normalizeValue(labelRow[index]);
    const normalizedLabel = normalizeForMatching(label);
    const normalizedInternal = normalizeForMatching(internalId);

    const coreField = findCoreField(normalizedLabel) ?? findCoreField(normalizedInternal);
    const category = determineCategory({
      coreField,
      internalId,
      normalizedLabel,
    });

    return {
      index,
      internalId,
      label,
      category,
      coreField,
    };
  });
}

function findCoreField(label: string | null | undefined): keyof UserCoreRow | undefined {
  if (!label) {
    return undefined;
  }
  return CORE_FIELD_LABELS[label];
}

function determineCategory(params: {
  coreField?: keyof UserCoreRow;
  internalId: string | null;
  normalizedLabel: string | null;
}): ColumnCategory {
  const { coreField, internalId, normalizedLabel } = params;

  if (coreField) {
    return 'core';
  }

  if (normalizedLabel && normalizedLabel.startsWith('流入経路:')) {
    return 'source';
  }

  if (normalizedLabel && normalizedLabel.startsWith('アンケート:')) {
    return 'survey';
  }

  if (internalId && internalId.startsWith('タグ_')) {
    return 'tag';
  }

  return 'other';
}

function assignCoreField(row: UserCoreRow, field: keyof UserCoreRow, value: string | null): void {
  switch (field) {
    case 'user_id':
      if (value) {
        row.user_id = value;
      }
      break;
    case 'display_name':
      row.display_name = value;
      break;
    case 'friend_added_at':
      row.friend_added_at = normalizeDateTime(value);
      break;
    case 'blocked':
      row.blocked = normalizeBoolean(value);
      break;
    case 'last_msg_at':
      row.last_msg_at = normalizeDateTime(value);
      break;
    case 'scenario_name':
      row.scenario_name = value;
      break;
    case 'scenario_days':
      row.scenario_days = normalizeInteger(value);
      break;
    case 'snapshot_date':
      break;
  }
}

function normalizeValue(input: unknown): string | null {
  if (input === undefined || input === null) {
    return null;
  }

  const replaced = String(input).replace(/\u3000/g, ' ');
  const trimmed = replaced.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function normalizeForMatching(value: string | null): string | null {
  return value ? value.normalize('NFKC') : null;
}

function parseFlag(value: string | null): number {
  return value === '1' ? 1 : 0;
}

function normalizeDateTime(value: string | null): string | null {
  if (!value || value === '-' || value === '--') {
    return null;
  }
  return value;
}

function normalizeBoolean(value: string | null): boolean | null {
  if (value === '1') {
    return true;
  }
  if (value === '0') {
    return false;
  }
  return null;
}

function normalizeInteger(value: string | null): number | null {
  if (!value || value === '-' || value === '--') {
    return null;
  }
  const normalized = value.replace(/,/g, '');
  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function stripPrefix(label: string, pattern: RegExp): string {
  return label.replace(pattern, '').trim();
}

function buildFallbackTagId(descriptor: ColumnDescriptor, index: number): string {
  if (descriptor.label) {
    const slug = descriptor.label
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (slug) {
      return `tag_${slug}`;
    }
  }
  return `tag_column_${index}`;
}
