import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('[youtube/env-check] Starting environment variable validation...');

    const googleServiceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const bqProjectId = process.env.BQ_PROJECT_ID;
    const youtubeDatasetId = process.env.YOUTUBE_BQ_DATASET_ID;

    // Detailed environment variable analysis
    const envAnalysis: EnvAnalysis = {
      GOOGLE_SERVICE_ACCOUNT_JSON: {
        exists: !!googleServiceAccountJson,
        length: googleServiceAccountJson?.length || 0,
        first50chars: googleServiceAccountJson?.slice(0, 50) || '',
        startsWithBrace: googleServiceAccountJson?.startsWith('{') || false,
        endsWithBrace: googleServiceAccountJson?.endsWith('}') || false,
        hasProjectId: googleServiceAccountJson?.includes('project_id') || false,
        hasPrivateKey: googleServiceAccountJson?.includes('private_key') || false,
        hasClientEmail: googleServiceAccountJson?.includes('client_email') || false,
      },
      BQ_PROJECT_ID: {
        exists: !!bqProjectId,
        value: bqProjectId || '',
        length: bqProjectId?.length || 0,
      },
      YOUTUBE_BQ_DATASET_ID: {
        exists: !!youtubeDatasetId,
        value: youtubeDatasetId || '',
        length: youtubeDatasetId?.length || 0,
      }
    };

    // Try to parse the JSON if it exists
    let jsonParseResult: JsonParseResult = null;
    if (googleServiceAccountJson) {
      try {
        const parsed = JSON.parse(googleServiceAccountJson);
        jsonParseResult = {
          success: true,
          hasRequiredFields: !!(parsed.project_id && parsed.private_key && parsed.client_email),
          projectId: parsed.project_id || null,
          clientEmail: parsed.client_email || null,
          hasPrivateKey: !!parsed.private_key,
          type: parsed.type || null,
        };
      } catch (error) {
        jsonParseResult = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown JSON parse error',
        };
      }
    }

    console.log('[youtube/env-check] Environment analysis:', envAnalysis);
    console.log('[youtube/env-check] JSON parse result:', jsonParseResult);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      envAnalysis,
      jsonParseResult,
      recommendations: generateRecommendations(envAnalysis, jsonParseResult)
    });

  } catch (error) {
    console.error('[youtube/env-check] Error during environment check:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}


type EnvAnalysis = {
  GOOGLE_SERVICE_ACCOUNT_JSON: {
    exists: boolean;
    length: number;
    first50chars: string;
    startsWithBrace: boolean;
    endsWithBrace: boolean;
    hasProjectId: boolean;
    hasPrivateKey: boolean;
    hasClientEmail: boolean;
  };
  BQ_PROJECT_ID: {
    exists: boolean;
    value: string;
    length: number;
  };
  YOUTUBE_BQ_DATASET_ID: {
    exists: boolean;
    value: string;
    length: number;
  };
};

type JsonParseResult =
  | null
  | {
      success: true;
      hasRequiredFields: boolean;
      projectId: string | null;
      clientEmail: string | null;
      hasPrivateKey: boolean;
      type: string | null;
    }
  | {
      success: false;
      error: string;
    };

function generateRecommendations(envAnalysis: EnvAnalysis, jsonParseResult: JsonParseResult): string[] {
  const recommendations: string[] = [];

  if (!envAnalysis.GOOGLE_SERVICE_ACCOUNT_JSON.exists) {
    recommendations.push('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is missing');
  } else if (envAnalysis.GOOGLE_SERVICE_ACCOUNT_JSON.length < 100) {
    recommendations.push('GOOGLE_SERVICE_ACCOUNT_JSON seems too short - might be truncated');
  } else if (!envAnalysis.GOOGLE_SERVICE_ACCOUNT_JSON.startsWithBrace) {
    recommendations.push('GOOGLE_SERVICE_ACCOUNT_JSON should start with {');
  } else if (!envAnalysis.GOOGLE_SERVICE_ACCOUNT_JSON.endsWithBrace) {
    recommendations.push('GOOGLE_SERVICE_ACCOUNT_JSON should end with }');
  }

  if (jsonParseResult && !jsonParseResult.success) {
    recommendations.push(`JSON parsing failed: ${jsonParseResult.error}`);
  } else if (jsonParseResult && !jsonParseResult.hasRequiredFields) {
    recommendations.push('Service account JSON is missing required fields (project_id, private_key, client_email)');
  }

  if (!envAnalysis.BQ_PROJECT_ID.exists) {
    recommendations.push('BQ_PROJECT_ID environment variable is missing');
  }

  if (!envAnalysis.YOUTUBE_BQ_DATASET_ID.exists) {
    recommendations.push('YOUTUBE_BQ_DATASET_ID environment variable is missing');
  }

  if (recommendations.length === 0) {
    recommendations.push('All environment variables appear to be correctly configured');
  }

  return recommendations;
}