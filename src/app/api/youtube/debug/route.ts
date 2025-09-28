import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

export async function GET() {
  try {
    console.log('[youtube/debug] Starting BigQuery connection test...');

    const projectId = resolveProjectId();
    const datasetId = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';

    console.log('[youtube/debug] Project ID:', projectId);
    console.log('[youtube/debug] Dataset ID:', datasetId);
    console.log('[youtube/debug] Environment variables check:');
    console.log('[youtube/debug] - BQ_PROJECT_ID:', !!process.env.BQ_PROJECT_ID);
    console.log('[youtube/debug] - YOUTUBE_BQ_DATASET_ID:', !!process.env.YOUTUBE_BQ_DATASET_ID);
    console.log('[youtube/debug] - GOOGLE_SERVICE_ACCOUNT_JSON:', !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    console.log('[youtube/debug] - GOOGLE_APPLICATION_CREDENTIALS:', !!process.env.GOOGLE_APPLICATION_CREDENTIALS);

    const client = createBigQueryClient(projectId);

    // Test basic BigQuery connection
    console.log('[youtube/debug] Testing basic BigQuery connection...');
    const [datasets] = await client.getDatasets();
    console.log('[youtube/debug] Available datasets:', datasets.map(d => d.id));

    // Test dataset access
    console.log('[youtube/debug] Testing dataset access...');
    const dataset = client.dataset(datasetId);
    const [exists] = await dataset.exists();

    if (!exists) {
      return NextResponse.json({
        success: false,
        error: `Dataset ${datasetId} does not exist`,
        projectId,
        datasetId,
        availableDatasets: datasets.map(d => d.id)
      });
    }

    // Test tables in dataset
    console.log('[youtube/debug] Testing tables in dataset...');
    const [tables] = await dataset.getTables();
    const tableNames = tables.map(t => t.id);
    console.log('[youtube/debug] Available tables:', tableNames);

    // Test specific YouTube tables
    const requiredTables = [
      'media_videos_snapshot',
      'media_metrics_daily',
      'media_channels_snapshot'
    ];

    const missingTables = requiredTables.filter(table => !tableNames.includes(table));

    if (missingTables.length > 0) {
      return NextResponse.json({
        success: false,
        error: `Missing required tables: ${missingTables.join(', ')}`,
        projectId,
        datasetId,
        availableTables: tableNames,
        missingTables
      });
    }

    // Test query execution
    console.log('[youtube/debug] Testing query execution...');
    const [rows] = await client.query({
      query: `
        SELECT COUNT(*) as total_rows
        FROM \`${projectId}.${datasetId}.media_videos_snapshot\`
        WHERE media = 'youtube'
      `
    });

    const videoCount = rows[0]?.total_rows || 0;
    console.log('[youtube/debug] YouTube video rows:', videoCount);

    const [metricsRows] = await client.query({
      query: `
        SELECT COUNT(*) as total_rows
        FROM \`${projectId}.${datasetId}.media_metrics_daily\`
        WHERE media = 'youtube'
      `
    });

    const metricsCount = metricsRows[0]?.total_rows || 0;
    console.log('[youtube/debug] YouTube metrics rows:', metricsCount);

    return NextResponse.json({
      success: true,
      projectId,
      datasetId,
      availableDatasets: datasets.map(d => d.id),
      availableTables: tableNames,
      youtubeVideoRows: Number(videoCount),
      youtubeMetricsRows: Number(metricsCount),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[youtube/debug] Error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}