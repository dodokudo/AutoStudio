export const FUNNEL_CAMPAIGNS = [
  {
    id: '2026-07',
    label: '7月ファネル',
    heading: '【2026.7】セミナーファネル サマリー',
    startDate: '2026-07-03',
    endDate: '2026-08-21',
    status: 'historical',
  },
  {
    id: '2026-09',
    label: '9月ファネル',
    heading: '【2026.9オート】セミナーファネル サマリー',
    startDate: '2026-09-08',
    endDate: null,
    status: 'active',
    launchFunnelId: 'funnel-1787405840209',
  },
] as const;

export type FunnelCampaign = (typeof FUNNEL_CAMPAIGNS)[number];
export type FunnelCampaignId = FunnelCampaign['id'];

export const DEFAULT_FUNNEL_CAMPAIGN_ID: FunnelCampaignId = '2026-09';

export function getFunnelCampaign(id: string | null | undefined): FunnelCampaign | null {
  return FUNNEL_CAMPAIGNS.find((campaign) => campaign.id === id) ?? null;
}

export function resolveFunnelQueryDates(campaign: FunnelCampaign, start: string | null, end: string | null) {
  if (start === null && end === null) {
    return { targetStartDate: campaign.startDate, targetEndDate: campaign.endDate ?? '2099-12-31' };
  }
  const isDate = (value: string | null): value is string => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!isDate(start) || !isDate(end)) throw new Error('開始日と終了日を正しい日付で指定してください');
  if (start > end) throw new Error('終了日は開始日以降にしてください');
  // 明示した期間は初期期間を上書きする。キャンペーンのタグ定義は変えない。
  return { targetStartDate: start, targetEndDate: end };
}

export function isAutomationFunnelId(funnelId: string): boolean {
  return FUNNEL_CAMPAIGNS.some(
    (campaign) => 'launchFunnelId' in campaign && campaign.launchFunnelId === funnelId,
  );
}
