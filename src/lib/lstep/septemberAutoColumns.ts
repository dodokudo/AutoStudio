// CSVの1行目にあるIDで識別する。表示名の変更や列の並び替えに影響されない。
export const SEPTEMBER_AUTO_COLUMNS = [
  ['タグ_10472574', 's9_auto_schedule_confirmed', '日程に確認OK'],
  ['タグ_10472531', 's9_auto_expectation_answered', '期待感アンケート回答総数'],
  ['タグ_10472543', 's9_auto_expectation_50', '期待感50%'],
  ['タグ_10472550', 's9_auto_expectation_75', '期待感75%'],
  ['タグ_10472553', 's9_auto_expectation_100', '期待感100%'],
  ['タグ_10472557', 's9_auto_expectation_125', '期待感125%'],
  ['タグ_10463649', 's9_auto_gift_tap', '特典タップ'],
  ['タグ_10463644', 's9_auto_video_watched_total', '動画視聴総数'],
  ['タグ_10473026', 's9_auto_gift_guide', '特典：攻略ガイド'],
  ['タグ_10463645', 's9_auto_survey_completed', 'アンケート回答済み'],
  ['タグ_10471291', 's9_auto_purchase_button', '購入タブタップ'],
  ['タグ_10463643', 's9_auto_seminar_form', 'セミナーフォーム遷移'],
  ['タグ_10463642', 's9_auto_seminar_applied_total', 'セミナー申込総数'],
  ['タグ_10463640', 's9_auto_one_tap_applied', 'ワンタップセミナー申込'],
  ['タグ_10463639', 's9_auto_form_applied', 'セミナーフォーム申込'],
  ['タグ_10463638', 's9_auto_seminar_joined_total', 'セミナー参加総数'],
  ['タグ_10463637', 's9_auto_seminar_bonus', 'セミナー参加特典 受取'],
  ['タグ_10475596', 's9_auto_product_lp_tap_total', '商品LPタップ総数'],
  ['タグ_10463635', 's9_auto_front_purchased_total', 'フロント購入総数'],
  ['友だち情報_2784886', 's9_auto_seminar_application_slot', 'セミナー申込日'],
] as const;

export function getSeptemberAutoColumn(internalId: string): string | undefined {
  return SEPTEMBER_AUTO_COLUMNS.find(([id]) => id === internalId.trim())?.[1];
}

export const SEPTEMBER_AUTO_COLUMN_LABELS: Record<string, string> = Object.fromEntries(
  SEPTEMBER_AUTO_COLUMNS.map(([, column, label]) => [column, `【2026.9オート】${label}`]),
);

export const SEPTEMBER_AUTO_PANEL_SECTIONS = [
  { title: '登録特典・アンケート・動画', columns: ['s9_auto_gift_tap', 's9_auto_gift_guide', 's9_auto_survey_completed', 's9_auto_video_watched_total'] },
  { title: 'セミナー申込', columns: ['s9_auto_seminar_form', 's9_auto_one_tap_applied', 's9_auto_form_applied', 's9_auto_seminar_applied_total'] },
  { title: 'リマインド・期待感アンケート', columns: ['s9_auto_schedule_confirmed', 's9_auto_expectation_answered', 's9_auto_expectation_50', 's9_auto_expectation_75', 's9_auto_expectation_100', 's9_auto_expectation_125'] },
  { title: 'セミナー視聴・講座購入', columns: ['s9_auto_seminar_joined_total', 's9_auto_seminar_bonus', 's9_auto_product_lp_tap_total', 's9_auto_purchase_button', 's9_auto_front_purchased_total'] },
].map(({ title, columns }) => ({
  title,
  items: columns.map((column) => ({ column, label: SEPTEMBER_AUTO_COLUMN_LABELS[column].replace('【2026.9オート】', '') })),
}));
