import assert from 'node:assert/strict';
import test from 'node:test';
import iconv from 'iconv-lite';
import { parse } from 'csv-parse/sync';
import { normalizeRawCsv } from './rawCsvLoader';
import { transformLstepCsv } from './csvTransform';

test('auto tag and friend-info IDs survive renamed labels, reordered columns and quoted newlines', () => {
  const csv = [
    '登録ID,,タグ_10463642,友だち情報_2784886,タグ_10156329,タグ_10463635',
    'ID,表示名,名称変更後,申込枠変更後,【2026.7】セミナー申込総数,【2026.9オート】フロント購入総数',
    '123,"名前\n2行目",1,9月12日13時,0,0',
  ].join('\r\n');
  const buffer = iconv.encode(csv, 'shift_jis');
  const result = normalizeRawCsv(buffer, '2026-09-11');
  assert.equal(result.rowCount, 1);
  const rows = parse(result.content);
  assert.deepEqual(result.headers, ['snapshot_date', 'id', 'display_name', 's9_auto_seminar_applied_total', 's9_auto_seminar_application_slot', 's7_seminar_applied_total', 's9_auto_front_purchased_total']);
  assert.equal(rows[1][2], '名前\n2行目');
  assert.equal(result.schema.find(f => f.name === 's9_auto_front_purchased_total')?.type, 'INTEGER');
  assert.equal(result.schema.find(f => f.name === 's9_auto_seminar_application_slot')?.type, 'STRING');
  const normalized = transformLstepCsv(buffer, '2026-09-11');
  assert.equal(normalized.userTags.find(t => t.tag_id === 'タグ_10463642')?.tag_flag, 1);
  assert.equal(normalized.userInfo[0].field_id, '友だち情報_2784886');
});

test('CSV dates retain Japan timezone and optional timestamp placeholders become null', () => {
  const csv = '登録ID,,,\nID,友だち追加日時,最終メッセージ日時,アンケート回答日\n1,2026-09-11 00:01:00,--,2026/09/11';
  const result = normalizeRawCsv(iconv.encode(csv, 'shift_jis'), '2026-09-11');
  assert.deepEqual(parse(result.content)[1], ['2026-09-11', '1', '2026-09-11 00:01:00+09:00', '', '2026-09-11']);
});

test('duplicate IDs fail before any BigQuery replacement', () => {
  assert.throws(() => normalizeRawCsv(iconv.encode('登録ID\nID\n1\n1', 'shift_jis'), '2026-09-11'), /重複ID/);
});
