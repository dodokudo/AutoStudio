export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? 'v23.0';
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export interface MetaActionMetric {
  action_type?: string;
  value?: string;
}

export interface MetaAdInsight {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  cpm?: string;
  cpp?: string;
  clicks?: string;
  ctr?: string;
  unique_clicks?: string;
  unique_ctr?: string;
  inline_link_clicks?: string;
  cost_per_inline_link_click?: string;
  inline_link_click_ctr?: string;
  video_play_actions?: MetaActionMetric[];
  video_p25_watched_actions?: MetaActionMetric[];
  video_p50_watched_actions?: MetaActionMetric[];
  video_p75_watched_actions?: MetaActionMetric[];
  video_p100_watched_actions?: MetaActionMetric[];
  video_avg_time_watched_actions?: MetaActionMetric[];
  cost_per_thruplay?: MetaActionMetric[];
  actions?: MetaActionMetric[];
  cost_per_action_type?: MetaActionMetric[];
  action_values?: MetaActionMetric[];
}

export interface MetaAdCreative {
  id?: string;
  name?: string;
  object_type?: string;
  thumbnail_url?: string;
  image_url?: string;
  video_id?: string;
  instagram_permalink_url?: string;
  object_story_id?: string;
  effective_object_story_id?: string;
  object_story_spec?: unknown;
  asset_feed_spec?: unknown;
}

export interface MetaAdWithCreative {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
  adset_id?: string;
  creative?: MetaAdCreative;
}

interface GraphListResponse<T> {
  data?: T[];
  paging?: {
    next?: string;
  };
  error?: {
    message: string;
    code?: number;
    type?: string;
  };
}

interface MetaVideoThumbnail {
  uri?: string;
  width?: number;
  height?: number;
  is_preferred?: boolean;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const json: GraphListResponse<unknown> = await response.json();
  if (!response.ok || json.error) {
    const message = json.error?.message ?? response.statusText;
    throw new Error(`Meta API error: ${message}`);
  }
  return json as T;
}

async function fetchPaged<T>(url: string): Promise<T[]> {
  const rows: T[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const json: GraphListResponse<T> = await fetchJson<GraphListResponse<T>>(nextUrl);
    rows.push(...(json.data ?? []));
    nextUrl = json.paging?.next;
  }

  return rows;
}

export async function fetchMetaVideoThumbnails(options: {
  accessToken: string;
  videoIds: string[];
}): Promise<Map<string, string>> {
  const uniqueVideoIds = [...new Set(options.videoIds.filter(Boolean))];
  const pairs = await Promise.all(
    uniqueVideoIds.map(async (videoId) => {
      const url = new URL(`${META_GRAPH_BASE}/${videoId}/thumbnails`);
      url.searchParams.set('fields', 'uri,is_preferred,width,height');
      url.searchParams.set('access_token', options.accessToken);

      try {
        const rows = await fetchPaged<MetaVideoThumbnail>(url.toString());
        const best = rows
          .filter((row) => row.uri)
          .sort((a, b) => {
            if (a.is_preferred !== b.is_preferred) return a.is_preferred ? -1 : 1;
            return (Number(b.width ?? 0) * Number(b.height ?? 0)) - (Number(a.width ?? 0) * Number(a.height ?? 0));
          })[0];
        return best?.uri ? ([videoId, best.uri] as const) : null;
      } catch (error) {
        console.warn(`[meta-ads] failed to fetch video thumbnail for ${videoId}:`, error instanceof Error ? error.message : error);
        return null;
      }
    }),
  );

  return new Map(pairs.filter((pair): pair is readonly [string, string] => Boolean(pair)));
}

export async function fetchMetaAdInsights(options: {
  accessToken: string;
  adAccountId: string;
  since?: string;
  until?: string;
  datePreset?: string;
}): Promise<MetaAdInsight[]> {
  const fields = [
    'campaign_id',
    'campaign_name',
    'adset_id',
    'adset_name',
    'ad_id',
    'ad_name',
    'date_start',
    'date_stop',
    'spend',
    'impressions',
    'reach',
    'frequency',
    'cpm',
    'cpp',
    'clicks',
    'ctr',
    'unique_clicks',
    'unique_ctr',
    'inline_link_clicks',
    'cost_per_inline_link_click',
    'inline_link_click_ctr',
    'video_play_actions',
    'video_p25_watched_actions',
    'video_p50_watched_actions',
    'video_p75_watched_actions',
    'video_p100_watched_actions',
    'video_avg_time_watched_actions',
    'cost_per_thruplay',
    'actions',
    'cost_per_action_type',
    'action_values',
  ];

  const url = new URL(`${META_GRAPH_BASE}/${options.adAccountId}/insights`);
  url.searchParams.set('level', 'ad');
  url.searchParams.set('time_increment', '1');
  url.searchParams.set('limit', '500');
  url.searchParams.set('fields', fields.join(','));
  url.searchParams.set('access_token', options.accessToken);

  if (options.since && options.until) {
    url.searchParams.set('time_range', JSON.stringify({ since: options.since, until: options.until }));
  } else {
    url.searchParams.set('date_preset', options.datePreset ?? 'yesterday');
  }

  return fetchPaged<MetaAdInsight>(url.toString());
}

export async function fetchMetaAdCreatives(options: {
  accessToken: string;
  adAccountId: string;
}): Promise<MetaAdWithCreative[]> {
  const fields = [
    'id',
    'name',
    'status',
    'effective_status',
    'campaign_id',
    'adset_id',
    'creative{id,name,object_type,thumbnail_url,image_url,video_id,instagram_permalink_url,object_story_id,effective_object_story_id,object_story_spec,asset_feed_spec}',
  ];

  const url = new URL(`${META_GRAPH_BASE}/${options.adAccountId}/ads`);
  url.searchParams.set('limit', '500');
  url.searchParams.set('fields', fields.join(','));
  url.searchParams.set('access_token', options.accessToken);

  return fetchPaged<MetaAdWithCreative>(url.toString());
}
