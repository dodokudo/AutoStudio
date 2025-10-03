import { v4 as uuidv4 } from 'uuid';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import type { ShortLink, ClickLog, LinkStats, CreateShortLinkRequest, UpdateShortLinkRequest } from './types';

const projectId = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID);
const dataset = 'autostudio_links';

const bigquery = createBigQueryClient(projectId);

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
        DATE(clicked_at) as date,
        COUNT(*) as clicks
      FROM \`${projectId}.${dataset}.click_logs\`
      WHERE short_link_id = @shortLinkId
      AND clicked_at >= @monthAgo
      GROUP BY date
      ORDER BY date DESC
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
    clicksByDate: clicksByDateResult.map((row: Record<string, unknown>) => ({
      date: String(row.date),
      clicks: parseInt(String(row.clicks)),
    })),
    clicksByReferrer: clicksByReferrerResult.map((row: Record<string, unknown>) => ({
      referrer: String(row.referrer),
      clicks: parseInt(String(row.clicks)),
    })),
    clicksByDevice: clicksByDeviceResult.map((row: Record<string, unknown>) => ({
      deviceType: String(row.deviceType),
      clicks: parseInt(String(row.clicks)),
    })),
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
  // streaming buffer問題を回避するため、古いレコードを無効化して新しいレコードを挿入
  // 1. 既存のレコードを取得
  const [existingRows] = await bigquery.query({
    query: `SELECT * FROM \`${projectId}.${dataset}.short_links\` WHERE id = @id LIMIT 1`,
    params: { id },
  });

  if (existingRows.length === 0) {
    throw new Error('Short link not found');
  }

  const existing = existingRows[0] as Record<string, unknown>;

  //2. 古いレコードを無効化（is_active = falseの新レコードとして挿入）
  await bigquery.dataset(dataset).table('short_links').insert([{
    id: existing.id,
    short_code: existing.short_code,
    destination_url: existing.destination_url,
    title: existing.title,
    description: existing.description,
    ogp_image_url: existing.ogp_image_url,
    management_name: existing.management_name,
    category: existing.category,
    created_at: existing.created_at,
    created_by: existing.created_by,
    is_active: false,
  }]);

  // 3. 更新された新しいレコードを挿入
  await bigquery.dataset(dataset).table('short_links').insert([{
    id: existing.id,
    short_code: existing.short_code,
    destination_url: req.destinationUrl,
    title: req.title || null,
    description: req.description || null,
    ogp_image_url: req.ogpImageUrl || null,
    management_name: req.managementName || null,
    category: req.category || null,
    created_at: existing.created_at,
    created_by: existing.created_by,
    is_active: true,
  }]);
}
