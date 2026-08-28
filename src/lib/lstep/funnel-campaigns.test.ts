import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_FUNNEL_CAMPAIGN_ID,
  FUNNEL_CAMPAIGNS,
  getFunnelCampaign,
  isAutomationFunnelId,
} from './funnel-campaigns';

test('September is the active default campaign', () => {
  const campaign = getFunnelCampaign(DEFAULT_FUNNEL_CAMPAIGN_ID);
  assert.equal(campaign?.id, '2026-09');
  assert.equal(campaign?.status, 'active');
  assert.equal(campaign?.startDate, '2026-08-22');
});

test('July ends before September starts', () => {
  const july = FUNNEL_CAMPAIGNS.find((campaign) => campaign.id === '2026-07');
  const september = FUNNEL_CAMPAIGNS.find((campaign) => campaign.id === '2026-09');
  assert.ok(july?.endDate);
  assert.ok(september);
  assert.ok(july.endDate < september.startDate);
});

test('the September launch is recognized as an automation funnel', () => {
  assert.equal(isAutomationFunnelId('funnel-1787405840209'), true);
  assert.equal(isAutomationFunnelId('another-funnel'), false);
});
