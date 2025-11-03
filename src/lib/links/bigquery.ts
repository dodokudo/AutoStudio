import { v4 as uuidv4 } from 'uuid';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import type {
  ShortLink,
  ClickLog,
  LinkStats,
  CreateShortLinkRequest,
  UpdateShortLinkRequest,
  LinkInsightsOverview,
  LinkInsightItem,
  LinkFunnel,
  LinkFunnelStep,
  LinkFunnelMetrics,
} from './types';

const projectId = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID);
const dataset = 'autostudio_links';
const FUNNEL_TABLE = 'link_funnels';
const FUNNEL_STEP_TABLE = 'link_funnel_steps';

const bigquery = createBigQueryClient(projectId);
const lstepDataset = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';

function resolveLstepProjectId(): string {
  const candidate =
    process.env.LSTEP_BQ_PROJECT_ID
    ?? process.env.BQ_PROJECT_ID
    ?? process.env.NEXT_PUBLIC_GCP_PROJECT_ID
    ?? process.env.GCP_PROJECT_ID
    ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!candidate) {
    throw new Error('LSTEP_BQ_PROJECT_ID もしくは関連するProject IDが設定されていません');
  }
  return resolveProjectId(candidate);
}

let lstepClientCache: ReturnType<typeof createBigQueryClient> | null = null;

function getLstepClient() {
  if (!lstepClientCache) {
    const lstepProjectId = resolveLstepProjectId();
    lstepClientCache = createBigQueryClient(lstepProjectId, process.env.LSTEP_BQ_LOCATION);
  }
  return lstepClientCache;
}

export async function createShortLink(req: CreateShortLinkRequest): Promise<ShortLink> {
  const id = uuidv4();
  const now = new Date().toISOString();

  const shortLink: ShortLink = {
    id,
    shortCode: req.shortCode,
    destinationUrl: req.destinationUrl,
    title: req.title,
    description: req.description,
    ogpImageUrl: req.ogpImageUrl,
    managementName: req.managementName,
    category: req.category,
    createdAt: now,
    isActive: true,
  };

  const row = {
    id: shortLink.id,
    short_code: shortLink.shortCode,
    destination_url: shortLink.destinationUrl,
    title: shortLink.title || null,
    description: shortLink.description || null,
    ogp_image_url: shortLink.ogpImageUrl || null,
    management_name: shortLink.managementName || null,
    category: shortLink.category || null,
    created_at: shortLink.createdAt,
    created_by: shortLink.createdBy || null,
    is_active: shortLink.isActive,
  };

  await bigquery.dataset(dataset).table('short_links').insert([row]);

  return shortLink;
}

export async function getShortLinkByCode(shortCode: string): Promise<ShortLink | null> {
  const query = `
    SELECT
      id,
      short_code as shortCode,
      destination_url as destinationUrl,
      title,
      description,
      ogp_image_url as ogpImageUrl,
      management_name as managementName,
      category,
      CAST(created_at AS STRING) as createdAt,
      created_by as createdBy,
      is_active as isActive
    FROM \`${projectId}.${dataset}.short_links\`
    WHERE short_code = @shortCode
    AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const [rows] = await bigquery.query({
    query,
    params: { shortCode },
  });

  return rows.length > 0 ? (rows[0] as ShortLink) : null;
}

export async function getAllShortLinks(): Promise<ShortLink[]> {
  const query = `
    WITH ranked_links AS (
      SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) as rn
      FROM \`${projectId}.${dataset}.short_links\`
      WHERE is_active = true
    )
    SELECT
      id,
      short_code as shortCode,
      destination_url as destinationUrl,
      title,
      description,
      ogp_image_url as ogpImageUrl,
      management_name as managementName,
      category,
      CAST(created_at AS STRING) as createdAt,
      created_by as createdBy,
      is_active as isActive
    FROM ranked_links
    WHERE rn = 1
    ORDER BY created_at DESC
  `;

  const [rows] = await bigquery.query({ query });
  return rows as ShortLink[];
}

async function ensureLinkFunnelTables() {
  const datasetRef = bigquery.dataset(dataset);
  const funnelTable = datasetRef.table(FUNNEL_TABLE);
  const stepTable = datasetRef.table(FUNNEL_STEP_TABLE);

  const [funnelExists] = await funnelTable.exists();
  if (!funnelExists) {
    await datasetRef.createTable(FUNNEL_TABLE, {
      schema: [
        { name: 'funnel_id', type: 'STRING' },
        { name: 'name', type: 'STRING' },
        { name: 'description', type: 'STRING' },
        { name: 'created_at', type: 'TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP' },
      ],
    });
  }

  const [stepExists] = await stepTable.exists();
  if (!stepExists) {
    await datasetRef.createTable(FUNNEL_STEP_TABLE, {
      schema: [
        { name: 'funnel_id', type: 'STRING' },
        { name: 'step_id', type: 'STRING' },
        { name: 'step_order', type: 'INT64' },
        { name: 'step_label', type: 'STRING' },
        { name: 'step_type', type: 'STRING' },
        { name: 'short_link_id', type: 'STRING' },
        { name: 'line_source', type: 'STRING' },
        { name: 'line_tag', type: 'STRING' },
        { name: 'created_at', type: 'TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP' },
      ],
    });
  }
}

function mapSteps(rawSteps: unknown): LinkFunnelStep[] {
  if (!Array.isArray(rawSteps)) {
    return [];
  }
  const mapped: LinkFunnelStep[] = [];
  for (const item of rawSteps) {
    if (!item) continue;
    const record = item as Record<string, unknown>;
    const stepId = String(record.step_id ?? record.stepId ?? '');
    if (!stepId) continue;
    mapped.push({
      stepId,
      order: Number(record.step_order ?? record.stepOrder ?? 0),
      label: String(record.step_label ?? record.stepLabel ?? ''),
      type: String(record.step_type ?? record.stepType ?? 'short_link') as LinkFunnelStep['type'],
      shortLinkId: record.short_link_id ? String(record.short_link_id) : undefined,
      lineSource: record.line_source ? String(record.line_source) : undefined,
      lineTag: record.line_tag ? String(record.line_tag) : undefined,
    });
  }
  return mapped.sort((a, b) => a.order - b.order);
}

function mapFunnelRow(row: Record<string, unknown>): LinkFunnel {
  return {
    id: String(row.funnel_id),
    name: String(row.name ?? ''),
    description: row.description ? String(row.description) : undefined,
    createdAt: toPlainTimestamp(row.created_at ?? row.createdAt ?? null) ?? undefined,
    updatedAt: toPlainTimestamp(row.updated_at ?? row.updatedAt ?? null) ?? undefined,
    steps: mapSteps((row.steps ?? []) as unknown),
  };
}

export async function listLinkFunnels(): Promise<LinkFunnel[]> {
  await ensureLinkFunnelTables();
  const [rows] = await bigquery.query({
    query: `
      SELECT
        f.funnel_id,
        f.name,
        f.description,
        f.created_at,
        f.updated_at,
        ARRAY_AGG(
          IF(
            s.step_id IS NULL,
            NULL,
            STRUCT(
              s.step_id AS step_id,
              s.step_order AS step_order,
              s.step_label AS step_label,
              s.step_type AS step_type,
              s.short_link_id AS short_link_id,
              s.line_source AS line_source,
              s.line_tag AS line_tag
            )
          )
          IGNORE NULLS
          ORDER BY s.step_order
        ) AS steps
      FROM \`${projectId}.${dataset}.${FUNNEL_TABLE}\` f
      LEFT JOIN \`${projectId}.${dataset}.${FUNNEL_STEP_TABLE}\` s
        ON f.funnel_id = s.funnel_id
      GROUP BY f.funnel_id, f.name, f.description, f.created_at, f.updated_at
      ORDER BY f.updated_at DESC
    `,
  });

  return (rows as Array<Record<string, unknown>>).map(mapFunnelRow);
}

export async function getLinkFunnel(funnelId: string): Promise<LinkFunnel | null> {
  if (!funnelId) return null;
  await ensureLinkFunnelTables();
  const [rows] = await bigquery.query({
    query: `
      SELECT
        f.funnel_id,
        f.name,
        f.description,
        f.created_at,
        f.updated_at,
        ARRAY_AGG(
          IF(
            s.step_id IS NULL,
            NULL,
            STRUCT(
              s.step_id AS step_id,
              s.step_order AS step_order,
              s.step_label AS step_label,
              s.step_type AS step_type,
              s.short_link_id AS short_link_id,
              s.line_source AS line_source,
              s.line_tag AS line_tag
            )
          )
          IGNORE NULLS
          ORDER BY s.step_order
        ) AS steps
      FROM \`${projectId}.${dataset}.${FUNNEL_TABLE}\` f
      LEFT JOIN \`${projectId}.${dataset}.${FUNNEL_STEP_TABLE}\` s
        ON f.funnel_id = s.funnel_id
      WHERE f.funnel_id = @funnelId
      GROUP BY f.funnel_id, f.name, f.description, f.created_at, f.updated_at
      LIMIT 1
    `,
    params: { funnelId },
  });

  if (!rows.length) {
    return null;
  }
  return mapFunnelRow(rows[0] as Record<string, unknown>);
}

export async function deleteLinkFunnel(funnelId: string): Promise<void> {
  if (!funnelId) return;
  await ensureLinkFunnelTables();
  await bigquery.query({
    query: `
      DELETE FROM \`${projectId}.${dataset}.${FUNNEL_STEP_TABLE}\`
      WHERE funnel_id = @funnelId
    `,
    params: { funnelId },
  });

  await bigquery.query({
    query: `
      DELETE FROM \`${projectId}.${dataset}.${FUNNEL_TABLE}\`
      WHERE funnel_id = @funnelId
    `,
    params: { funnelId },
  });
}

export async function upsertLinkFunnel(funnel: LinkFunnel): Promise<LinkFunnel> {
  await ensureLinkFunnelTables();
  const nowIso = new Date().toISOString();

  await bigquery.query({
    query: `
      MERGE \`${projectId}.${dataset}.${FUNNEL_TABLE}\` T
      USING (SELECT @funnelId AS funnel_id) S
      ON T.funnel_id = S.funnel_id
      WHEN MATCHED THEN
        UPDATE SET
          name = @name,
          description = NULLIF(@description, ''),
          updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN
        INSERT (funnel_id, name, description, created_at, updated_at)
        VALUES (@funnelId, @name, NULLIF(@description, ''), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
    `,
    params: {
      funnelId: funnel.id,
      name: funnel.name,
      description: funnel.description ?? '',
    },
  });

  await bigquery.query({
    query: `
      DELETE FROM \`${projectId}.${dataset}.${FUNNEL_STEP_TABLE}\`
      WHERE funnel_id = @funnelId
    `,
    params: { funnelId: funnel.id },
  });

  if (funnel.steps.length > 0) {
    const rows = funnel.steps.map((step) => ({
      funnel_id: funnel.id,
      step_id: step.stepId,
      step_order: Number(step.order),
      step_label: step.label,
      step_type: step.type,
      short_link_id: step.shortLinkId ?? null,
      line_source: step.lineSource ?? null,
      line_tag: step.lineTag ?? null,
      created_at: nowIso,
      updated_at: nowIso,
    }));
    await bigquery.dataset(dataset).table(FUNNEL_STEP_TABLE).insert(rows);
  }

  const latest = await getLinkFunnel(funnel.id);
  if (!latest) {
    throw new Error('Failed to fetch funnel after upsert');
  }
  return latest;
}

function toPlainTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const inner = (value as { value?: unknown }).value;
    if (!inner) return null;
    if (typeof inner === 'string') return inner;
    if (inner instanceof Date) return inner.toISOString();
    return String(inner);
  }
  return String(value);
}

function calculatePeriodDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00+09:00`);
  const end = new Date(`${endDate}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 1;
  }
  const diff = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return diff >= 0 ? diff + 1 : 1;
}

export async function getLinkInsightsOverview(params: { startDate: string; endDate: string }): Promise<LinkInsightsOverview> {
  let { startDate, endDate } = params;
  if (startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  const baseLatestLinksCte = `
    WITH latest_links AS (
      SELECT
        id,
        short_code,
        destination_url,
        management_name,
        category,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) AS rn
      FROM \`${projectId}.${dataset}.short_links\`
      WHERE is_active = TRUE
    )
  `;

  const queryParams = { startDate, endDate };

  const [summaryRows] = await bigquery.query({
    query: `
      ${baseLatestLinksCte}
      SELECT
        COUNT(DISTINCT ll.id) AS link_count,
        COUNTIF(DATE(TIMESTAMP(cl.clicked_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate) AS period_clicks,
        COUNT(cl.id) AS lifetime_clicks
      FROM latest_links ll
      LEFT JOIN \`${projectId}.${dataset}.click_logs\` cl
        ON cl.short_link_id = ll.id
      WHERE ll.rn = 1
    `,
    params: queryParams,
  });

  const [categoryRows] = await bigquery.query({
    query: `
      ${baseLatestLinksCte}
      SELECT
        COALESCE(ll.category, 'uncategorized') AS category,
        COUNTIF(DATE(TIMESTAMP(cl.clicked_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate) AS clicks
      FROM latest_links ll
      LEFT JOIN \`${projectId}.${dataset}.click_logs\` cl
        ON cl.short_link_id = ll.id
      WHERE ll.rn = 1
      GROUP BY category
      ORDER BY clicks DESC
    `,
    params: queryParams,
  });

  const [linkRows] = await bigquery.query({
    query: `
      ${baseLatestLinksCte}
      SELECT
        ll.id,
        ll.short_code AS short_code,
        ll.destination_url AS destination_url,
        ll.management_name AS management_name,
        ll.category AS category,
        CAST(ll.created_at AS STRING) AS created_at,
        COUNTIF(DATE(TIMESTAMP(cl.clicked_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate) AS period_clicks,
        COUNT(cl.id) AS lifetime_clicks,
        MAX(cl.clicked_at) AS last_clicked_at
      FROM latest_links ll
      LEFT JOIN \`${projectId}.${dataset}.click_logs\` cl
        ON cl.short_link_id = ll.id
      WHERE ll.rn = 1
      GROUP BY ll.id, short_code, destination_url, management_name, category, created_at
      ORDER BY last_clicked_at DESC NULLS LAST, period_clicks DESC, created_at DESC
    `,
    params: queryParams,
  });

  const summaryRow = (summaryRows?.[0] ?? {}) as Record<string, unknown>;
  const periodDays = calculatePeriodDays(startDate, endDate);

  const links: LinkInsightItem[] = (linkRows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    shortCode: String(row.short_code),
    destinationUrl: String(row.destination_url),
    managementName: row.management_name ? String(row.management_name) : undefined,
    category: row.category ? String(row.category) : null,
    createdAt: String(row.created_at),
    periodClicks: Number(row.period_clicks ?? 0),
    lifetimeClicks: Number(row.lifetime_clicks ?? 0),
    lastClickedAt: toPlainTimestamp(row.last_clicked_at),
  }));

  return {
    summary: {
      periodStart: startDate,
      periodEnd: endDate,
      periodDays,
      totalClicks: Number(summaryRow.period_clicks ?? 0),
      lifetimeClicks: Number(summaryRow.lifetime_clicks ?? 0),
      totalLinks: Number(summaryRow.link_count ?? 0),
      byCategory: (categoryRows as Array<Record<string, unknown>>)
        .map((row) => ({
          category: String(row.category ?? 'uncategorized'),
          clicks: Number(row.clicks ?? 0),
        }))
        .filter((item) => item.clicks > 0),
    },
    links,
  };
}

export async function logClick(shortLinkId: string, metadata: Partial<ClickLog>): Promise<void> {
  const id = uuidv4();
  const now = new Date().toISOString();

  const row = {
    id,
    short_link_id: shortLinkId,
    clicked_at: now,
    referrer: metadata.referrer || null,
    user_agent: metadata.userAgent || null,
    ip_address: metadata.ipAddress || null,
    country: metadata.country || null,
    device_type: metadata.deviceType || null,
  };

  await bigquery.dataset(dataset).table('click_logs').insert([row]);
}

export async function getLinkStats(shortLinkId: string): Promise<LinkStats> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 総クリック数
  const [totalResult] = await bigquery.query({
    query: `
      SELECT COUNT(*) as count
      FROM \`${projectId}.${dataset}.click_logs\`
      WHERE short_link_id = @shortLinkId
    `,
    params: { shortLinkId },
  });
  const totalClicks = parseInt(totalResult[0]?.count || '0');

  // 今日のクリック数
  const [todayResult] = await bigquery.query({
    query: `
      SELECT COUNT(*) as count
      FROM \`${projectId}.${dataset}.click_logs\`
      WHERE short_link_id = @shortLinkId
      AND DATE(clicked_at) = @today
    `,
    params: { shortLinkId, today },
  });
  const clicksToday = parseInt(todayResult[0]?.count || '0');

  // 過去7日間のクリック数
  const [weekResult] = await bigquery.query({
    query: `
      SELECT COUNT(*) as count
      FROM \`${projectId}.${dataset}.click_logs\`
      WHERE short_link_id = @shortLinkId
      AND clicked_at >= @weekAgo
    `,
    params: { shortLinkId, weekAgo },
  });
  const clicksThisWeek = parseInt(weekResult[0]?.count || '0');

  // 過去30日間のクリック数
  const [monthResult] = await bigquery.query({
    query: `
      SELECT COUNT(*) as count
      FROM \`${projectId}.${dataset}.click_logs\`
      WHERE short_link_id = @shortLinkId
      AND clicked_at >= @monthAgo
    `,
    params: { shortLinkId, monthAgo },
  });
  const clicksThisMonth = parseInt(monthResult[0]?.count || '0');

  // 日別クリック数（過去30日）
  const [clicksByDateResult] = await bigquery.query({
    query: `
      SELECT
        FORMAT_DATE('%Y-%m-%d', DATE(clicked_at)) as date,
        COUNT(*) as clicks
      FROM \`${projectId}.${dataset}.click_logs\`
      WHERE short_link_id = @shortLinkId
      AND clicked_at >= @monthAgo
      GROUP BY FORMAT_DATE('%Y-%m-%d', DATE(clicked_at))
      ORDER BY FORMAT_DATE('%Y-%m-%d', DATE(clicked_at)) DESC
    `,
    params: { shortLinkId, monthAgo },
  });

  // リファラー別クリック数
  const [clicksByReferrerResult] = await bigquery.query({
    query: `
      SELECT
        COALESCE(referrer, 'Direct') as referrer,
        COUNT(*) as clicks
      FROM \`${projectId}.${dataset}.click_logs\`
      WHERE short_link_id = @shortLinkId
      GROUP BY referrer
      ORDER BY clicks DESC
      LIMIT 10
    `,
    params: { shortLinkId },
  });

  // デバイス別クリック数
  const [clicksByDeviceResult] = await bigquery.query({
    query: `
      SELECT
        COALESCE(device_type, 'Unknown') as deviceType,
        COUNT(*) as clicks
      FROM \`${projectId}.${dataset}.click_logs\`
      WHERE short_link_id = @shortLinkId
      GROUP BY device_type
      ORDER BY clicks DESC
    `,
    params: { shortLinkId },
  });

  return {
    totalClicks,
    clicksToday,
    clicksThisWeek,
    clicksThisMonth,
    clicksByDate: (clicksByDateResult as Array<Record<string, unknown>>).map((row) => {
      const dateValue = row.date;
      const dateStr = typeof dateValue === 'object' && dateValue !== null && 'value' in dateValue
        ? String((dateValue as { value: unknown }).value)
        : String(dateValue);
      return {
        date: dateStr,
        clicks: parseInt(String(row.clicks)),
      };
    }),
    clicksByReferrer: (clicksByReferrerResult as Array<Record<string, unknown>>).map((row) => ({
      referrer: String(row.referrer),
      clicks: parseInt(String(row.clicks)),
    })),
    clicksByDevice: (clicksByDeviceResult as Array<Record<string, unknown>>).map((row) => ({
      deviceType: String(row.deviceType),
      clicks: parseInt(String(row.clicks)),
    })),
  };
}

async function countShortLinkClicks(shortLinkId: string, startDate: string, endDate: string): Promise<number> {
  if (!shortLinkId) return 0;
  const [rows] = await bigquery.query({
    query: `
      SELECT COUNT(*) AS clicks
      FROM \`${projectId}.${dataset}.click_logs\`
      WHERE short_link_id = @shortLinkId
        AND DATE(TIMESTAMP(clicked_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate
    `,
    params: { shortLinkId, startDate, endDate },
  });
  const row = rows[0] as Record<string, unknown> | undefined;
  return Number(row?.clicks ?? 0);
}

async function countLineRegistrations(
  startDate: string,
  endDate: string,
  options: { lineSource?: string; lineTag?: string },
): Promise<number> {
  const client = getLstepClient();
  const lstepProjectId = resolveLstepProjectId();

  const joins: string[] = [];
  const conditions: string[] = [];
  const params: Record<string, string> = { startDate, endDate };

  if (options.lineSource) {
    joins.push(`
      INNER JOIN \`${lstepProjectId}.${lstepDataset}.user_sources\` sources
        ON core.user_id = sources.user_id
        AND core.snapshot_date = sources.snapshot_date
    `);
    conditions.push('sources.source_flag = 1', 'sources.source_name = @lineSource');
    params.lineSource = options.lineSource;
  }

  if (options.lineTag) {
    joins.push(`
      INNER JOIN \`${lstepProjectId}.${lstepDataset}.user_tags\` tags
        ON core.user_id = tags.user_id
        AND core.snapshot_date = tags.snapshot_date
    `);
    conditions.push('tags.tag_flag = 1', 'tags.tag_name = @lineTag');
    params.lineTag = options.lineTag;
  }

  const joinClause = joins.join('\n');
  const conditionClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  const [rows] = await client.query({
    query: `
      WITH registered AS (
        SELECT DISTINCT core.user_id
        FROM \`${lstepProjectId}.${lstepDataset}.user_core\` core
        ${joinClause}
        WHERE DATE(TIMESTAMP(core.friend_added_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate
        ${conditionClause}
      )
      SELECT COUNT(*) AS registrations FROM registered
    `,
    params,
  });

  const row = rows[0] as Record<string, unknown> | undefined;
  return Number(row?.registrations ?? 0);
}

export async function getLinkFunnelMetrics(
  funnelId: string,
  params: { startDate: string; endDate: string },
): Promise<LinkFunnelMetrics> {
  const funnel = await getLinkFunnel(funnelId);
  if (!funnel) {
    throw new Error(`Funnel ${funnelId} not found`);
  }

  let { startDate, endDate } = params;
  if (startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  const counts: number[] = [];
  for (const step of funnel.steps) {
    let count = 0;
    if (step.type === 'short_link') {
      count = await countShortLinkClicks(step.shortLinkId ?? '', startDate, endDate);
    } else if (step.type === 'line_registration') {
      count = await countLineRegistrations(startDate, endDate, {
        lineSource: step.lineSource,
        lineTag: step.lineTag,
      });
    }
    counts.push(count);
  }

  const baseCount = counts[0] ?? 0;

  const metricsSteps = funnel.steps.map((step, index) => {
    const count = counts[index] ?? 0;
    const previousCount = index === 0 ? baseCount : counts[index - 1] ?? 0;
    const conversionRate = previousCount > 0 ? (count / previousCount) * 100 : 0;
    const cumulativeRate = baseCount > 0 ? (count / baseCount) * 100 : 0;
    return {
      stepId: step.stepId,
      label: step.label,
      type: step.type,
      count,
      conversionRate,
      cumulativeRate,
    };
  });

  return {
    funnel,
    startDate,
    endDate,
    steps: metricsSteps,
    totalCount: baseCount,
  };
}

export async function checkShortCodeExists(shortCode: string): Promise<boolean> {
  const query = `
    SELECT COUNT(*) as count
    FROM \`${projectId}.${dataset}.short_links\`
    WHERE short_code = @shortCode
  `;

  const [rows] = await bigquery.query({
    query,
    params: { shortCode },
  });

  return parseInt(rows[0]?.count || '0') > 0;
}

export async function updateShortLink(id: string, req: UpdateShortLinkRequest): Promise<void> {
  // streaming buffer問題を回避: UPDATE不要で新レコード挿入のみ
  // 最新のcreated_atを持つレコードが常に有効なバージョンとなる

  // 1. 既存のレコードを取得
  const [existingRows] = await bigquery.query({
    query: `
      SELECT *
      FROM \`${projectId}.${dataset}.short_links\`
      WHERE id = @id
      AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `,
    params: { id },
  });

  if (existingRows.length === 0) {
    throw new Error('Short link not found');
  }

  const existing = existingRows[0] as Record<string, unknown>;
  const now = new Date().toISOString();

  // 2. 更新された新レコードを挿入（created_atを現在時刻で更新）
  // 古いレコードはそのまま残るが、クエリ時に最新のもののみ取得される
  await bigquery.dataset(dataset).table('short_links').insert([
    {
      id: existing.id,
      short_code: existing.short_code,
      destination_url: req.destinationUrl,
      title: req.title || null,
      description: req.description || null,
      ogp_image_url: req.ogpImageUrl || null,
      management_name: req.managementName || null,
      category: req.category || null,
      created_at: now, // 新しいタイムスタンプ
      created_by: existing.created_by,
      is_active: true,
    },
  ]);
}
