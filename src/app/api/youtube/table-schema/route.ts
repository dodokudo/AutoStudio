import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

export async function GET() {
  try {
    console.log('[youtube/table-schema] Starting table schema check...');

    const projectId = resolveProjectId();
    const datasetId = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';

    const client = createBigQueryClient(projectId);

    // Get schema for media_videos_snapshot
    console.log('[youtube/table-schema] Getting schema for media_videos_snapshot...');
    const [videosSchema] = await client.query({
      query: `
        SELECT column_name, data_type, is_nullable
        FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = 'media_videos_snapshot'
        ORDER BY ordinal_position
      `
    });

    // Get schema for media_channels_snapshot
    console.log('[youtube/table-schema] Getting schema for media_channels_snapshot...');
    const [channelsSchema] = await client.query({
      query: `
        SELECT column_name, data_type, is_nullable
        FROM \`${projectId}.${datasetId}.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = 'media_channels_snapshot'
        ORDER BY ordinal_position
      `
    });

    // Get sample data to see actual column names
    console.log('[youtube/table-schema] Getting sample data...');
    const [sampleVideos] = await client.query({
      query: `
        SELECT *
        FROM \`${projectId}.${datasetId}.media_videos_snapshot\`
        WHERE media = 'youtube'
        LIMIT 1
      `
    });

    const [sampleChannels] = await client.query({
      query: `
        SELECT *
        FROM \`${projectId}.${datasetId}.media_channels_snapshot\`
        WHERE media = 'youtube'
        LIMIT 1
      `
    });

    return NextResponse.json({
      success: true,
      schemas: {
        media_videos_snapshot: videosSchema,
        media_channels_snapshot: channelsSchema
      },
      sampleData: {
        video: sampleVideos[0] || null,
        channel: sampleChannels[0] || null
      },
      sampleKeys: {
        videoKeys: sampleVideos[0] ? Object.keys(sampleVideos[0]) : [],
        channelKeys: sampleChannels[0] ? Object.keys(sampleChannels[0]) : []
      }
    });

  } catch (error) {
    console.error('[youtube/table-schema] Error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}