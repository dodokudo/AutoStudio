import { google } from 'googleapis';

const DEFAULT_GRAPH_VERSION = 'v26.0';
const DEFAULT_SOURCE_USERNAME = 'kudooo_ai';
const DEFAULT_REFRESH_THRESHOLD_DAYS = 7;
const DATA_ACCESS_WARNING_DAYS = 30;

type FetchLike = typeof fetch;

interface GraphErrorBody {
  error?: {
    code?: number;
    message?: string;
    type?: string;
  };
}

interface TokenDebugData {
  app_id?: string;
  data_access_expires_at?: number;
  expires_at?: number;
  is_valid?: boolean;
  type?: string;
}

interface TokenExchangeResponse extends GraphErrorBody {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

interface ManagedPage {
  access_token?: string;
  id: string;
  instagram_business_account?: {
    id: string;
    name?: string;
    username?: string;
  };
  name?: string;
}

interface ManagedPagesResponse extends GraphErrorBody {
  data?: ManagedPage[];
}

export interface CompetitorFacebookContext {
  accessToken: string;
  instagramUserId: string;
  instagramUsername: string;
  pageId: string;
  pageName: string | null;
  source: 'facebook-page-token';
  tokenDataAccessExpiresAt: string | null;
  tokenExpiresAt: string | null;
  tokenWasExchanged: boolean;
}

function getGraphBase(): string {
  const version = process.env.IG_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;
  return `https://graph.facebook.com/${version}`;
}

function unixSecondsToIso(value: number | undefined): string | null {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

function daysUntil(unixSeconds: number | undefined, now: Date): number | null {
  if (!unixSeconds) return null;
  return (unixSeconds * 1000 - now.getTime()) / 86_400_000;
}

function describeGraphError(body: GraphErrorBody, status: number): string {
  const error = body.error;
  if (!error) return `HTTP ${status}`;
  return `HTTP ${status} code=${error.code ?? 'unknown'} ${error.message ?? error.type ?? 'Graph API error'}`;
}

async function fetchJson<T extends GraphErrorBody>(url: URL, fetchImpl: FetchLike): Promise<T> {
  const response = await fetchImpl(url);
  const body = (await response.json().catch(() => ({}))) as T;
  if (!response.ok || body.error) {
    throw new Error(describeGraphError(body, response.status));
  }
  return body;
}

async function debugToken(
  token: string,
  appId: string,
  appSecret: string,
  fetchImpl: FetchLike,
): Promise<TokenDebugData> {
  const url = new URL(`${getGraphBase()}/debug_token`);
  url.searchParams.set('input_token', token);
  url.searchParams.set('access_token', `${appId}|${appSecret}`);
  const response = await fetchJson<{ data?: TokenDebugData } & GraphErrorBody>(url, fetchImpl);
  if (!response.data?.is_valid) {
    throw new Error('Facebook competitor token is invalid');
  }
  if (response.data.app_id && response.data.app_id !== appId) {
    throw new Error(
      `Facebook competitor token belongs to app ${response.data.app_id}, expected ${appId}`,
    );
  }
  return response.data;
}

export function shouldExchangeFacebookToken(
  debug: Pick<TokenDebugData, 'expires_at'>,
  now = new Date(),
  thresholdDays = DEFAULT_REFRESH_THRESHOLD_DAYS,
): boolean {
  const remainingDays = daysUntil(debug.expires_at, now);
  return remainingDays !== null && remainingDays <= thresholdDays;
}

async function exchangeForLongLivedToken(
  token: string,
  appId: string,
  appSecret: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const url = new URL(`${getGraphBase()}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', token);
  const response = await fetchJson<TokenExchangeResponse>(url, fetchImpl);
  if (!response.access_token) {
    throw new Error('Facebook long-lived token exchange returned no access token');
  }
  return response.access_token;
}

async function listManagedPages(token: string, fetchImpl: FetchLike): Promise<ManagedPage[]> {
  const url = new URL(`${getGraphBase()}/me/accounts`);
  url.searchParams.set(
    'fields',
    'id,name,access_token,tasks,instagram_business_account{id,username,name}',
  );
  url.searchParams.set('access_token', token);
  const response = await fetchJson<ManagedPagesResponse>(url, fetchImpl);
  return response.data ?? [];
}

async function addSecretVersion(secretParent: string, value: string): Promise<void> {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const secretManager = google.secretmanager({ version: 'v1', auth });
  await secretManager.projects.secrets.addVersion({
    parent: secretParent,
    requestBody: {
      payload: {
        data: Buffer.from(value, 'utf8').toString('base64'),
      },
    },
  });
}

export async function getCompetitorFacebookContext(options?: {
  fetchImpl?: FetchLike;
  now?: Date;
  persistToken?: (token: string) => Promise<void>;
}): Promise<CompetitorFacebookContext> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const now = options?.now ?? new Date();
  const appId =
    process.env.IG_COMPETITOR_FB_APP_ID?.trim() || process.env.FACEBOOK_APP_ID?.trim();
  const appSecret =
    process.env.IG_COMPETITOR_FB_APP_SECRET?.trim() || process.env.FACEBOOK_APP_SECRET?.trim();
  let userToken = process.env.IG_COMPETITOR_FB_ACCESS_TOKEN?.trim();
  const sourceUsername =
    process.env.IG_COMPETITOR_SOURCE_USERNAME?.trim() || DEFAULT_SOURCE_USERNAME;

  if (!appId || !appSecret || !userToken) {
    throw new Error(
      'IG_COMPETITOR_FB_APP_ID, IG_COMPETITOR_FB_APP_SECRET and IG_COMPETITOR_FB_ACCESS_TOKEN are required',
    );
  }

  let tokenDebug = await debugToken(userToken, appId, appSecret, fetchImpl);
  let tokenWasExchanged = false;

  if (shouldExchangeFacebookToken(tokenDebug, now)) {
    const exchangedToken = await exchangeForLongLivedToken(
      userToken,
      appId,
      appSecret,
      fetchImpl,
    );
    tokenDebug = await debugToken(exchangedToken, appId, appSecret, fetchImpl);
    userToken = exchangedToken;
    tokenWasExchanged = true;

    const persistToken =
      options?.persistToken ??
      (process.env.IG_COMPETITOR_FB_TOKEN_SECRET?.trim()
        ? (token: string) =>
            addSecretVersion(process.env.IG_COMPETITOR_FB_TOKEN_SECRET!.trim(), token)
        : null);
    if (persistToken) {
      await persistToken(userToken);
    } else {
      console.warn(
        '[instagram-facebook-auth] token was exchanged but IG_COMPETITOR_FB_TOKEN_SECRET is not set; the new token was not persisted',
      );
    }
  }

  const dataAccessDays = daysUntil(tokenDebug.data_access_expires_at, now);
  if (dataAccessDays !== null && dataAccessDays <= DATA_ACCESS_WARNING_DAYS) {
    console.warn(
      `[instagram-facebook-auth] Facebook data access expires in ${Math.max(0, Math.ceil(dataAccessDays))} days; user reauthorization is required before ${unixSecondsToIso(tokenDebug.data_access_expires_at)}`,
    );
  }

  const pages = await listManagedPages(userToken, fetchImpl);
  const page = pages.find(
    (candidate) => candidate.instagram_business_account?.username === sourceUsername,
  );
  if (!page?.access_token || !page.instagram_business_account) {
    const available = pages
      .map((candidate) => candidate.instagram_business_account?.username)
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `Instagram source account @${sourceUsername} is not linked to a managed Facebook Page. Available: ${available || 'none'}`,
    );
  }

  return {
    accessToken: page.access_token,
    instagramUserId: page.instagram_business_account.id,
    instagramUsername: page.instagram_business_account.username ?? sourceUsername,
    pageId: page.id,
    pageName: page.name ?? null,
    source: 'facebook-page-token',
    tokenDataAccessExpiresAt: unixSecondsToIso(tokenDebug.data_access_expires_at),
    tokenExpiresAt: unixSecondsToIso(tokenDebug.expires_at),
    tokenWasExchanged,
  };
}
