import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fetchChannelSnapshots } from '@/lib/youtube/api';
import { createYoutubeBigQueryContext, ensureYoutubeTables } from '@/lib/youtube/bigquery';
import { loadYoutubeConfig } from '@/lib/youtube/config';
import {
  deactivateYoutubeCompetitor,
  listActiveYoutubeCompetitors,
  upsertYoutubeCompetitor,
  upsertYoutubeCompetitors,
  type YoutubeCompetitorCategory,
} from '@/lib/youtube/competitors';
import { syncYoutubeChannelSnapshots } from '@/lib/youtube/sync';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

function resolveChannelId(value?: string): string {
  const match = value?.match(/UC[A-Za-z0-9_-]{22}/);
  if (!match) {
    throw new Error('YouTubeチャンネルID（UCから始まる24文字）または /channel/ URLを指定してください。');
  }
  return match[0];
}

function resolveCategory(value?: string): YoutubeCompetitorCategory {
  if (value === 'ai' || value === 'threads') return value;
  throw new Error('category は ai または threads を指定してください。');
}

async function main() {
  const [command, channelValue, categoryValue, ...rest] = process.argv.slice(2);
  const config = loadYoutubeConfig();
  const context = createYoutubeBigQueryContext(config.projectId, config.datasetId);
  await ensureYoutubeTables(context);

  if (command === 'list') {
    const competitors = await listActiveYoutubeCompetitors(context);
    console.table(
      competitors.map((competitor) => ({
        category: competitor.category,
        channel: competitor.channelTitle,
        channelId: competitor.channelId,
      })),
    );
    return;
  }

  if (command === 'add-batch') {
    const category = resolveCategory(channelValue);
    const channelIds = (categoryValue ?? '')
      .split(',')
      .map((value) => resolveChannelId(value.trim()));
    const note = rest.join(' ').trim() || undefined;
    const channels = await fetchChannelSnapshots(config, channelIds);
    if (channels.length !== channelIds.length) {
      const foundIds = new Set(channels.map((channel) => channel.channelId));
      const missingIds = channelIds.filter((channelId) => !foundIds.has(channelId));
      throw new Error(`YouTubeチャンネルが見つかりません: ${missingIds.join(', ')}`);
    }
    await upsertYoutubeCompetitors(
      context,
      channels.map((channel) => ({
        channelId: channel.channelId,
        channelTitle: channel.title,
        category,
        note,
        active: true,
      })),
    );
    console.info(`[youtube-competitor] registered ${channels.length} channels as ${category}`);

    let syncedChannels = 0;
    let syncedVideos = 0;
    for (let index = 0; index < channelIds.length; index += 3) {
      const result = await syncYoutubeChannelSnapshots(config, context, channelIds.slice(index, index + 3), {
        maxResults: 200,
        daysBack: 730,
      });
      syncedChannels += result.channelCount;
      syncedVideos += result.videoCount;
    }
    console.info(`[youtube-competitor] synced ${syncedChannels} channels and ${syncedVideos} videos`);
    return;
  }

  const channelId = resolveChannelId(channelValue);
  if (command === 'deactivate') {
    await deactivateYoutubeCompetitor(context, channelId);
    console.info(`[youtube-competitor] deactivated ${channelId}`);
    return;
  }

  if (command !== 'add') {
    throw new Error(
      'Usage: npm run youtube:competitor -- add <channel-id-or-url> <ai|threads> [note] [--no-sync]\n' +
      '       npm run youtube:competitor -- add-batch <ai|threads> <channel-id,...> [note]\n' +
      '       npm run youtube:competitor -- deactivate <channel-id-or-url>\n' +
      '       npm run youtube:competitor -- list',
    );
  }

  const category = resolveCategory(categoryValue);
  const shouldSync = !rest.includes('--no-sync');
  const note = rest.filter((value) => value !== '--no-sync').join(' ').trim() || undefined;
  const [channel] = await fetchChannelSnapshots(config, [channelId]);
  if (!channel) {
    throw new Error(`YouTubeチャンネルが見つかりません: ${channelId}`);
  }

  await upsertYoutubeCompetitor(context, {
    channelId,
    channelTitle: channel.title,
    category,
    note,
    active: true,
  });
  console.info(`[youtube-competitor] registered ${channel.title} as ${category}`);

  if (shouldSync) {
    const result = await syncYoutubeChannelSnapshots(config, context, [channelId], {
      maxResults: 200,
      daysBack: 730,
    });
    console.info(`[youtube-competitor] synced ${result.channelCount} channel and ${result.videoCount} videos`);
  }
}

main().catch((error) => {
  console.error('[youtube-competitor] failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
