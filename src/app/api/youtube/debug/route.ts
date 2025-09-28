import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

export async function GET() {
  try {
    console.log('[youtube/debug] Starting comprehensive BigQuery connection test...');

    // Step 1: Environment variable detailed check
    const projectId = resolveProjectId();
    const datasetId = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';

    console.log('[youtube/debug] === ENVIRONMENT VARIABLES ===');
    console.log('[youtube/debug] Project ID:', projectId);
    console.log('[youtube/debug] Dataset ID:', datasetId);
    console.log('[youtube/debug] BQ_PROJECT_ID exists:', !!process.env.BQ_PROJECT_ID);
    console.log('[youtube/debug] YOUTUBE_BQ_DATASET_ID exists:', !!process.env.YOUTUBE_BQ_DATASET_ID);
    console.log('[youtube/debug] GOOGLE_SERVICE_ACCOUNT_JSON exists:', !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    console.log('[youtube/debug] GOOGLE_SERVICE_ACCOUNT_JSON length:', process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.length || 0);
    console.log('[youtube/debug] GOOGLE_SERVICE_ACCOUNT_JSON first 100 chars:', process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.slice(0, 100) || 'NOT FOUND');
    console.log('[youtube/debug] GOOGLE_APPLICATION_CREDENTIALS exists:', !!process.env.GOOGLE_APPLICATION_CREDENTIALS);

    // Step 2: BigQuery client creation with detailed logging
    console.log('[youtube/debug] === BIGQUERY CLIENT CREATION ===');
    const client = createBigQueryClient(projectId);
    console.log('[youtube/debug] BigQuery client created successfully');

    // Step 3: Basic connectivity tests in order of complexity
    console.log('[youtube/debug] === STEP 3: BASIC QUERY TEST ===');
    try {
      const [basicRows] = await client.query({
        query: 'SELECT 1 as test_value, "hello" as test_string'
      });
      console.log('[youtube/debug] Basic query successful:', basicRows[0]);
    } catch (error) {
      console.error('[youtube/debug] Basic query failed:', error);
      throw new Error(`Basic query failed: ${error}`);
    }

    // Step 4: Dataset access test
    console.log('[youtube/debug] === STEP 4: DATASET ACCESS TEST ===');
    try {
      const [datasets] = await client.getDatasets();
      console.log('[youtube/debug] Available datasets:', datasets.map(d => d.id));

      const dataset = client.dataset(datasetId);
      const [exists] = await dataset.exists();
      console.log('[youtube/debug] Dataset exists:', exists);

      if (!exists) {
        return NextResponse.json({
          success: false,
          error: `Dataset ${datasetId} does not exist`,
          step: 'dataset_access',
          availableDatasets: datasets.map(d => d.id)
        });
      }
    } catch (error) {
      console.error('[youtube/debug] Dataset access failed:', error);
      throw new Error(`Dataset access failed: ${error}`);
    }

    // Step 5: Table access test
    console.log('[youtube/debug] === STEP 5: TABLE ACCESS TEST ===');
    try {
      const dataset = client.dataset(datasetId);
      const [tables] = await dataset.getTables();
      const tableNames = tables.map(t => t.id);
      console.log('[youtube/debug] Available tables:', tableNames);

      const requiredTables = ['media_videos_snapshot', 'media_metrics_daily', 'media_channels_snapshot'];
      const missingTables = requiredTables.filter(table => !tableNames.includes(table));

      if (missingTables.length > 0) {
        return NextResponse.json({
          success: false,
          error: `Missing required tables: ${missingTables.join(', ')}`,
          step: 'table_access',
          availableTables: tableNames,
          missingTables
        });
      }
    } catch (error) {
      console.error('[youtube/debug] Table access failed:', error);
      throw new Error(`Table access failed: ${error}`);
    }

    // Step 6: Simple table query test
    console.log('[youtube/debug] === STEP 6: SIMPLE TABLE QUERY TEST ===');
    try {
      const [simpleRows] = await client.query({
        query: `SELECT COUNT(*) as total_count FROM \`${projectId}.${datasetId}.media_videos_snapshot\``
      });
      console.log('[youtube/debug] Total rows in media_videos_snapshot:', simpleRows[0]?.total_count);
    } catch (error) {
      console.error('[youtube/debug] Simple table query failed:', error);
      throw new Error(`Simple table query failed: ${error}`);
    }

    // Step 7: YouTube-specific query test
    console.log('[youtube/debug] === STEP 7: YOUTUBE-SPECIFIC QUERY TEST ===');
    try {
      const [youtubeRows] = await client.query({
        query: `
          SELECT COUNT(*) as total_rows
          FROM \`${projectId}.${datasetId}.media_videos_snapshot\`
          WHERE media = 'youtube'
        `
      });

      const videoCount = youtubeRows[0]?.total_rows || 0;
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

      // Step 8: Test the actual problematic query structure
      console.log('[youtube/debug] === STEP 8: PROBLEMATIC QUERY STRUCTURE TEST ===');
      const [complexRows] = await client.query({
        query: `
          SELECT v.content_id, v.title, v.view_count
          FROM \`${projectId}.${datasetId}.media_videos_snapshot\` v
          LEFT JOIN \`${projectId}.${datasetId}.media_channels_snapshot\` c
            ON v.channel_id = c.channel_id AND v.snapshot_date = c.snapshot_date AND c.media = 'youtube'
          WHERE v.media = 'youtube'
            AND (c.is_self = TRUE OR c.is_self IS NULL)
          ORDER BY CASE
            WHEN v.view_velocity IS NOT NULL THEN v.view_velocity
            WHEN v.view_count IS NOT NULL THEN v.view_count
            ELSE 0
          END DESC
          LIMIT 5
        `
      });
      console.log('[youtube/debug] Complex query successful, rows:', complexRows.length);

      return NextResponse.json({
        success: true,
        message: 'All tests passed successfully',
        youtubeVideoRows: Number(videoCount),
        youtubeMetricsRows: Number(metricsCount),
        complexQueryRows: complexRows.length,
        testsPassed: ['basic_query', 'dataset_access', 'table_access', 'simple_table_query', 'youtube_query', 'complex_query']
      });

    } catch (error) {
      console.error('[youtube/debug] YouTube-specific query failed:', error);
      throw new Error(`YouTube-specific query failed: ${error}`);
    }

  } catch (error) {
    console.error('[youtube/debug] Comprehensive test failed at some step:', error);

    // Determine which step failed based on error message
    let failedStep = 'unknown';
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('Basic query failed')) failedStep = 'basic_query';
    else if (errorMessage.includes('Dataset access failed')) failedStep = 'dataset_access';
    else if (errorMessage.includes('Table access failed')) failedStep = 'table_access';
    else if (errorMessage.includes('Simple table query failed')) failedStep = 'simple_table_query';
    else if (errorMessage.includes('YouTube-specific query failed')) failedStep = 'youtube_query';

    return NextResponse.json({
      success: false,
      failedStep,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      environmentDebug: {
        hasGoogleServiceAccount: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
        serviceAccountLength: process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.length || 0,
        hasBqProjectId: !!process.env.BQ_PROJECT_ID,
        hasYoutubeDatasetId: !!process.env.YOUTUBE_BQ_DATASET_ID
      }
    }, { status: 500 });
  }
}