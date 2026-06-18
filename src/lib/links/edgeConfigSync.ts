import { getAllShortLinksFromBigQuery } from '@/lib/links/bigquery';
import type { EdgeShortLink } from '@/lib/links/edgeRedirectMap';
import type { ShortLink } from '@/lib/links/types';

const EDGE_CONFIG_ITEM_KEY = 'short_links';
const VERCEL_CLI_CLIENT_ID = 'cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp';
const VERCEL_TOKEN_ENDPOINT = 'https://api.vercel.com/login/oauth/token';

interface VercelPatchResponse {
  status: number;
  text: string;
}

export interface EdgeConfigSyncResult {
  synced: boolean;
  count: number;
  error?: string;
}

function requireEdgeConfigEnv(): {
  apiToken?: string;
  refreshToken?: string;
  edgeConfigId: string;
  teamId: string;
} {
  const apiToken = process.env.VERCEL_API_TOKEN;
  const refreshToken = process.env.VERCEL_REFRESH_TOKEN;
  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if ((!apiToken && !refreshToken) || !edgeConfigId || !teamId) {
    throw new Error('Edge Config sync env is not configured');
  }

  return { apiToken, refreshToken, edgeConfigId, teamId };
}

async function refreshVercelAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch(VERCEL_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'AutoStudio Edge Config Sync',
    },
    body: new URLSearchParams({
      client_id: VERCEL_CLI_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Vercel token refresh failed: ${response.status} ${text}`);
  }

  const payload = JSON.parse(text) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error('Vercel token refresh response does not include access_token');
  }

  return payload.access_token;
}

async function patchEdgeConfig(
  shortLinks: Record<string, EdgeShortLink>,
): Promise<VercelPatchResponse> {
  const { apiToken, refreshToken, edgeConfigId, teamId } = requireEdgeConfigEnv();
  const patch = (token: string) => fetch(
    `https://api.vercel.com/v1/edge-config/${edgeConfigId}/items?teamId=${teamId}`,
    {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${apiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            operation: 'upsert',
            key: EDGE_CONFIG_ITEM_KEY,
            value: shortLinks,
          },
        ],
      }),
    },
  );

  let response = apiToken ? await patch(apiToken) : null;
  if ((!response || response.status === 401 || response.status === 403) && refreshToken) {
    response = await patch(await refreshVercelAccessToken(refreshToken));
  }

  if (!response) {
    throw new Error('Edge Config sync env is not configured');
  }

  return {
    status: response.status,
    text: await response.text(),
  };
}

function toEdgeShortLink(link: ShortLink): EdgeShortLink {
  return {
    id: link.id,
    destinationUrl: link.destinationUrl,
    title: link.title || undefined,
    description: link.description || undefined,
    ogpImageUrl: link.ogpImageUrl || undefined,
  };
}

export async function syncShortLinksToEdgeConfig(
  priorityLinks: ShortLink[] = [],
): Promise<EdgeConfigSyncResult> {
  try {
    const links = await getAllShortLinksFromBigQuery();
    const shortLinks = links.reduce<Record<string, EdgeShortLink>>((acc, link) => {
      acc[link.shortCode] = toEdgeShortLink(link);
      return acc;
    }, {});

    for (const link of priorityLinks) {
      if (link.isActive === false) continue;
      shortLinks[link.shortCode] = toEdgeShortLink(link);
    }

    const result = await patchEdgeConfig(shortLinks);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Vercel Edge Config update failed: ${result.status} ${result.text}`);
    }

    return {
      synced: true,
      count: Object.keys(shortLinks).length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[links/edge-config] sync failed', message);
    return {
      synced: false,
      count: 0,
      error: message,
    };
  }
}
