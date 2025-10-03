export interface ShortLink {
  id: string;
  shortCode: string;
  destinationUrl: string;
  title?: string;
  description?: string;
  ogpImageUrl?: string;
  managementName?: string;
  category?: 'threads' | 'instagram' | 'youtube' | 'ad';
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
  category?: 'threads' | 'instagram' | 'youtube' | 'ad';
}
