export interface ShortLink {
  id: string;
  shortCode: string;
  destinationUrl: string;
  title?: string;
  description?: string;
  ogpImageUrl?: string;
  managementName?: string;
  category?: 'threads' | 'instagram' | 'youtube' | 'ad' | 'line';
  createdAt: string;
  createdBy?: string;
  isActive: boolean;
}

export interface ClickLog {
  id: string;
  shortLinkId: string;
  clickedAt: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
  country?: string;
  deviceType?: string;
}

export interface LinkStats {
  totalClicks: number;
  clicksToday: number;
  clicksThisWeek: number;
  clicksThisMonth: number;
  clicksByDate: Array<{ date: string; clicks: number }>;
  clicksByReferrer: Array<{ referrer: string; clicks: number }>;
  clicksByDevice: Array<{ deviceType: string; clicks: number }>;
}

export interface CreateShortLinkRequest {
  shortCode: string;
  destinationUrl: string;
  title?: string;
  description?: string;
  ogpImageUrl?: string;
  managementName?: string;
  category?: 'threads' | 'instagram' | 'youtube' | 'ad' | 'line';
}

export interface UpdateShortLinkRequest {
  destinationUrl: string;
  title?: string;
  description?: string;
  ogpImageUrl?: string;
  managementName?: string;
  category?: 'threads' | 'instagram' | 'youtube' | 'ad' | 'line';
}

export interface LinkInsightsSummary {
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  totalClicks: number;
  lifetimeClicks: number;
  totalLinks: number;
  byCategory: Array<{ category: string; clicks: number }>;
}

export interface LinkInsightItem {
  id: string;
  shortCode: string;
  destinationUrl: string;
  managementName?: string;
  category?: string | null;
  createdAt: string;
  periodClicks: number;
  lifetimeClicks: number;
  lastClickedAt?: string | null;
}

export interface LinkInsightsOverview {
  summary: LinkInsightsSummary;
  links: LinkInsightItem[];
}

export type LinkFunnelStepType = 'short_link' | 'line_registration';

export interface LinkFunnelStep {
  stepId: string;
  order: number;
  label: string;
  type: LinkFunnelStepType;
  shortLinkId?: string;
  lineSource?: string;
  lineTag?: string;
}

export interface LinkFunnel {
  id: string;
  name: string;
  description?: string;
  steps: LinkFunnelStep[];
  createdAt?: string;
  updatedAt?: string;
}

export interface LinkFunnelMetricsStep {
  stepId: string;
  label: string;
  type: LinkFunnelStepType;
  count: number;
  conversionRate: number;
  cumulativeRate: number;
}

export interface LinkFunnelMetrics {
  funnel: LinkFunnel;
  startDate: string;
  endDate: string;
  steps: LinkFunnelMetricsStep[];
  totalCount: number;
}
