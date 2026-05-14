import { createBigQueryClient } from '@/lib/bigquery';

const ANALYCA_PROJECT_ID = process.env.ANALYCA_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID ?? 'mark-454114';
const ANALYCA_DATASET_ID = process.env.ANALYCA_BQ_DATASET ?? 'analyca';
const ANALYCA_LOCATION = process.env.ANALYCA_BQ_LOCATION ?? process.env.IG_GCP_LOCATION ?? 'asia-northeast1';

export interface InstagramAccessContext {
  accessToken: string;
  analycaUserId: string;
  autostudioUserId: string;
  instagramUserId: string;
  instagramUsername: string | null;
  tokenExpiresAt: string | null;
  source: 'analyca' | 'env';
}

interface AnalycaTokenRow {
  user_id: string;
  instagram_user_id: string | null;
  instagram_username: string | null;
  access_token: string | null;
  token_expires_at: { value?: string } | string | null;
}

function timestampToString(value: AnalycaTokenRow['token_expires_at']): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.value ?? null;
}

function resolveSelector(selector?: string): string {
  return selector?.trim()
    || process.env.IG_ANALYCA_USER_ID?.trim()
    || process.env.IG_DEFAULT_USER_ID?.trim()
    || process.env.IG_USERNAME?.trim()
    || 'kudooo_ai';
}

function isExpired(value: string | null): boolean {
  if (!value) return false;
  const expiresAt = new Date(value).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export async function getInstagramAccessContext(selector?: string): Promise<InstagramAccessContext> {
  const resolvedSelector = resolveSelector(selector);
  const envToken = process.env.IG_ACCESS_TOKEN?.trim() || process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const envInstagramUserId = process.env.IG_USER_ID?.trim() || process.env.INSTAGRAM_USER_ID?.trim();

  const bigquery = createBigQueryClient(ANALYCA_PROJECT_ID, ANALYCA_LOCATION);
  const [rows] = await bigquery.query({
    query: `
      SELECT
        user_id,
        instagram_user_id,
        instagram_username,
        access_token,
        token_expires_at
      FROM \`${ANALYCA_PROJECT_ID}.${ANALYCA_DATASET_ID}.users\`
      WHERE
        user_id = @selector
        OR instagram_user_id = @selector
        OR instagram_username = @selector
      ORDER BY token_expires_at DESC
      LIMIT 1
    `,
    params: { selector: resolvedSelector },
    location: ANALYCA_LOCATION,
  });

  const row = rows[0] as AnalycaTokenRow | undefined;
  if (row?.access_token && row.instagram_user_id) {
    const tokenExpiresAt = timestampToString(row.token_expires_at);
    if (isExpired(tokenExpiresAt) && !envToken) {
      throw new Error(
        `Instagram token for "${resolvedSelector}" expired at ${tokenExpiresAt}. Reconnect Instagram in ANALYCA, then rerun AutoStudio ig:metrics.`,
      );
    }

    return {
      accessToken: row.access_token,
      analycaUserId: row.user_id,
      autostudioUserId: process.env.IG_AUTOSTUDIO_USER_ID?.trim() || row.instagram_username || resolvedSelector,
      instagramUserId: row.instagram_user_id,
      instagramUsername: row.instagram_username,
      tokenExpiresAt,
      source: 'analyca',
    };
  }

  if (envToken && envInstagramUserId) {
    return {
      accessToken: envToken,
      analycaUserId: resolvedSelector,
      autostudioUserId: process.env.IG_AUTOSTUDIO_USER_ID?.trim() || process.env.IG_USERNAME?.trim() || resolvedSelector,
      instagramUserId: envInstagramUserId,
      instagramUsername: process.env.IG_USERNAME?.trim() || null,
      tokenExpiresAt: null,
      source: 'env',
    };
  }

  throw new Error(
    `No valid Instagram token found for "${resolvedSelector}". Reconnect Instagram in ANALYCA or set IG_ACCESS_TOKEN and IG_USER_ID.`,
  );
}
