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
    heading: '【2026.9】セミナーファネル サマリー',
    startDate: '2026-08-22',
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

export function isAutomationFunnelId(funnelId: string): boolean {
  return FUNNEL_CAMPAIGNS.some(
    (campaign) => 'launchFunnelId' in campaign && campaign.launchFunnelId === funnelId,
  );
}
