import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_FUNNEL_CAMPAIGN_ID,
  FUNNEL_CAMPAIGNS,
  getFunnelCampaign,
  isAutomationFunnelId,
  resolveFunnelQueryDates,
} from './funnel-campaigns';

test('September is the active default campaign', () => {
  const campaign = getFunnelCampaign(DEFAULT_FUNNEL_CAMPAIGN_ID);
  assert.equal(campaign?.id, '2026-09');
  assert.equal(campaign?.status, 'active');
  assert.equal(campaign?.startDate, '2026-09-08');
});

test('explicit dates override the campaign default without changing its tag campaign', () => {
  const campaign = getFunnelCampaign('2026-09')!;
  assert.deepEqual(resolveFunnelQueryDates(campaign, null, null), {
    targetStartDate: '2026-09-08', targetEndDate: '2099-12-31',
  });
  assert.deepEqual(resolveFunnelQueryDates(campaign, '2026-09-07', '2026-09-30'), {
    targetStartDate: '2026-09-07', targetEndDate: '2026-09-30',
  });
  assert.deepEqual(resolveFunnelQueryDates(campaign, '2026-09-10', '2026-09-10'), {
    targetStartDate: '2026-09-10', targetEndDate: '2026-09-10',
  });
});

test('invalid, incomplete and reversed date ranges are rejected', () => {
  const campaign = getFunnelCampaign('2026-09')!;
  for (const [start, end] of [['2026-02-30', '2026-09-30'], ['bad', '2026-09-30'], ['2026-09-08', null], ['2026-09-30', '2026-09-07']]) {
    assert.throws(() => resolveFunnelQueryDates(campaign, start, end));
  }
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
