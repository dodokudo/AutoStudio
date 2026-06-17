import { getAllShortLinksFromBigQuery } from '@/lib/links/bigquery';
import type { EdgeShortLink } from '@/lib/links/edgeRedirectMap';
import type { ShortLink } from '@/lib/links/types';

const EDGE_CONFIG_ITEM_KEY = 'short_links';

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
  apiToken: string;
  edgeConfigId: string;
  teamId: string;
} {
  const apiToken = process.env.VERCEL_API_TOKEN;
  const edgeConfigId = process.env.EDGE_CONFIG_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!apiToken || !edgeConfigId || !teamId) {
    throw new Error('Edge Config sync env is not configured');
  }

  return { apiToken, edgeConfigId, teamId };
}

async function patchEdgeConfig(
  shortLinks: Record<string, EdgeShortLink>,
): Promise<VercelPatchResponse> {
  const { apiToken, edgeConfigId, teamId } = requireEdgeConfigEnv();
  const response = await fetch(
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
