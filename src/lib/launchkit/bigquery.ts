import { v4 as uuidv4 } from 'uuid';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const projectId = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID);
const dataset = 'autostudio_links';
const LPS_TABLE = 'launchkit_lps';
const EVENTS_TABLE = 'launchkit_events';

const bigquery = createBigQueryClient(projectId);

export type LaunchkitGenre = 'opt' | 'seminar' | 'consult' | 'other';
export type LaunchkitSource = 'threads' | 'instagram' | 'ad' | 'note' | 'youtube' | 'other';
export type LaunchkitEventType = 'page_view' | 'line_cta_click';

export interface LaunchkitLP {
  id: string;
  name: string;
  slug: string;
  url: string;
  genre: LaunchkitGenre | null;
  source: LaunchkitSource | null;
  lineCtaUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLPInput {
  name: string;
  slug: string;
  url: string;
  genre?: LaunchkitGenre;
  source?: LaunchkitSource;
  lineCtaUrl?: string;
}

export interface UpdateLPInput {
  name?: string;
  slug?: string;
  url?: string;
  genre?: LaunchkitGenre;
  source?: LaunchkitSource;
  lineCtaUrl?: string;
  isActive?: boolean;
}

export interface RecordEventInput {
  lpId: string;
  eventType: LaunchkitEventType;
  url?: string;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
  deviceType?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  fbclid?: string;
}

function rowToLP(row: Record<string, unknown>): LaunchkitLP {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    url: String(row.url),
    genre: row.genre ? (String(row.genre) as LaunchkitGenre) : null,
    source: row.source ? (String(row.source) as LaunchkitSource) : null,
    lineCtaUrl: row.line_cta_url ? String(row.line_cta_url) : null,
    isActive: Boolean(row.is_active),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toIso(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'value' in value) {
    const v = (value as { value: unknown }).value;
    if (typeof v === 'string') return v;
    if (v instanceof Date) return v.toISOString();
    return String(v ?? '');
  }
  return String(value);
}

export async function createLP(input: CreateLPInput): Promise<LaunchkitLP> {
  const id = uuidv4();
  const now = new Date().toISOString();

  const row = {
    id,
    name: input.name,
    slug: input.slug,
    url: input.url,
    genre: input.genre ?? null,
    source: input.source ?? null,
    line_cta_url: input.lineCtaUrl ?? null,
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  await bigquery.dataset(dataset).table(LPS_TABLE).insert([row]);

  return {
    id,
    name: input.name,
    slug: input.slug,
    url: input.url,
    genre: input.genre ?? null,
    source: input.source ?? null,
    lineCtaUrl: input.lineCtaUrl ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listLPs(includeInactive = false): Promise<LaunchkitLP[]> {
  const query = `
    WITH ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY updated_at DESC) AS rn
      FROM \`${projectId}.${dataset}.${LPS_TABLE}\`
    )
    SELECT id, name, slug, url, genre, source, line_cta_url, is_active,
           CAST(created_at AS STRING) AS created_at,
           CAST(updated_at AS STRING) AS updated_at
    FROM ranked
    WHERE rn = 1${includeInactive ? '' : ' AND is_active = TRUE'}
    ORDER BY updated_at DESC
  `;
  const [rows] = await bigquery.query({ query });
  return (rows as Array<Record<string, unknown>>).map(rowToLP);
}

export async function getLP(id: string): Promise<LaunchkitLP | null> {
  const query = `
    SELECT id, name, slug, url, genre, source, line_cta_url, is_active,
           CAST(created_at AS STRING) AS created_at,
           CAST(updated_at AS STRING) AS updated_at
    FROM \`${projectId}.${dataset}.${LPS_TABLE}\`
    WHERE id = @id
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  const [rows] = await bigquery.query({ query, params: { id } });
  if (!rows.length) return null;
  return rowToLP(rows[0] as Record<string, unknown>);
}

export async function updateLP(id: string, input: UpdateLPInput): Promise<LaunchkitLP> {
  const existing = await getLP(id);
  if (!existing) throw new Error('LP not found');

  const now = new Date().toISOString();
  const merged = {
    id: existing.id,
    name: input.name ?? existing.name,
    slug: input.slug ?? existing.slug,
    url: input.url ?? existing.url,
    genre: input.genre ?? existing.genre,
    source: input.source ?? existing.source,
    line_cta_url: input.lineCtaUrl ?? existing.lineCtaUrl,
    is_active: input.isActive ?? existing.isActive,
    created_at: existing.createdAt,
    updated_at: now,
  };

  await bigquery.dataset(dataset).table(LPS_TABLE).insert([merged]);

  return {
    id: merged.id,
    name: merged.name,
    slug: merged.slug,
    url: merged.url,
    genre: merged.genre as LaunchkitGenre | null,
    source: merged.source as LaunchkitSource | null,
    lineCtaUrl: merged.line_cta_url,
    isActive: merged.is_active,
    createdAt: merged.created_at,
    updatedAt: merged.updated_at,
  };
}

export async function deactivateLP(id: string): Promise<void> {
  await updateLP(id, { isActive: false });
}

export async function recordEvent(input: RecordEventInput): Promise<void> {
  const lp = await getLP(input.lpId);
  if (!lp) throw new Error('LP not found');

  const row = {
    id: uuidv4(),
    lp_id: input.lpId,
    event_type: input.eventType,
    occurred_at: new Date().toISOString(),
    referrer: input.referrer ?? null,
    user_agent: input.userAgent ?? null,
    ip_address: input.ipAddress ?? null,
    device_type: input.deviceType ?? null,
    url: input.url ?? null,
    source: lp.source,
    genre: lp.genre,
    utm_source: input.utmSource ?? null,
    utm_medium: input.utmMedium ?? null,
    utm_campaign: input.utmCampaign ?? null,
    fbclid: input.fbclid ?? null,
  };

  await bigquery.dataset(dataset).table(EVENTS_TABLE).insert([row]);
}

export interface LPMetrics {
  lpId: string;
  pageViews: number;
  ctaClicks: number;
  ctaRate: number;
}

export async function getLPMetrics(
  startDate: string,
  endDate: string,
): Promise<LPMetrics[]> {
  const query = `
    SELECT
      lp_id,
      COUNTIF(event_type = 'page_view') AS page_views,
      COUNTIF(event_type = 'line_cta_click') AS cta_clicks
    FROM \`${projectId}.${dataset}.${EVENTS_TABLE}\`
    WHERE DATE(occurred_at, "Asia/Tokyo") BETWEEN @startDate AND @endDate
    GROUP BY lp_id
  `;
  const [rows] = await bigquery.query({ query, params: { startDate, endDate } });
  return (rows as Array<Record<string, unknown>>).map((row) => {
    const pv = Number(row.page_views ?? 0);
    const cc = Number(row.cta_clicks ?? 0);
    return {
      lpId: String(row.lp_id),
      pageViews: pv,
      ctaClicks: cc,
      ctaRate: pv > 0 ? (cc / pv) * 100 : 0,
    };
  });
}

export async function getMetricsByGenre(
  startDate: string,
  endDate: string,
): Promise<Array<{ genre: string; pageViews: number; ctaClicks: number; ctaRate: number }>> {
  const query = `
    SELECT
      COALESCE(genre, 'other') AS genre,
      COUNTIF(event_type = 'page_view') AS page_views,
      COUNTIF(event_type = 'line_cta_click') AS cta_clicks
    FROM \`${projectId}.${dataset}.${EVENTS_TABLE}\`
    WHERE DATE(occurred_at, "Asia/Tokyo") BETWEEN @startDate AND @endDate
    GROUP BY genre
    ORDER BY page_views DESC
  `;
  const [rows] = await bigquery.query({ query, params: { startDate, endDate } });
  return (rows as Array<Record<string, unknown>>).map((row) => {
    const pv = Number(row.page_views ?? 0);
    const cc = Number(row.cta_clicks ?? 0);
    return {
      genre: String(row.genre),
      pageViews: pv,
      ctaClicks: cc,
      ctaRate: pv > 0 ? (cc / pv) * 100 : 0,
    };
  });
}

export async function getMetricsBySource(
  startDate: string,
  endDate: string,
): Promise<Array<{ source: string; pageViews: number; ctaClicks: number; ctaRate: number }>> {
  const query = `
    SELECT
      COALESCE(source, 'other') AS source,
      COUNTIF(event_type = 'page_view') AS page_views,
      COUNTIF(event_type = 'line_cta_click') AS cta_clicks
    FROM \`${projectId}.${dataset}.${EVENTS_TABLE}\`
    WHERE DATE(occurred_at, "Asia/Tokyo") BETWEEN @startDate AND @endDate
    GROUP BY source
    ORDER BY page_views DESC
  `;
  const [rows] = await bigquery.query({ query, params: { startDate, endDate } });
  return (rows as Array<Record<string, unknown>>).map((row) => {
    const pv = Number(row.page_views ?? 0);
    const cc = Number(row.cta_clicks ?? 0);
    return {
      source: String(row.source),
      pageViews: pv,
      ctaClicks: cc,
      ctaRate: pv > 0 ? (cc / pv) * 100 : 0,
    };
  });
}
