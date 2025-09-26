import { BigQuery } from '@google-cloud/bigquery';
import { loadInstagramConfig } from './config';
import { createInstagramBigQuery } from './bigquery';

export interface CompetitorProfile {
  username: string;
  driveFolderId?: string;
  category?: string;
  source: 'private' | 'user';
  priority: number;
  active: boolean;
}

export async function listActiveCompetitors(bigquery?: BigQuery): Promise<CompetitorProfile[]> {
  const client = bigquery ?? createInstagramBigQuery();
  const config = loadInstagramConfig();
  const query = `
    WITH private AS (
      SELECT
        username,
        drive_folder_id,
        category,
        0 AS priority,
        IFNULL(active, TRUE) AS active,
        'private' AS source
      FROM \
\`${config.projectId}.${config.dataset}.instagram_competitors_private\`
    ),
    user_defined AS (
      SELECT
        username,
        drive_folder_id,
        category,
        IFNULL(priority, 100) AS priority,
        IFNULL(active, TRUE) AS active,
        'user' AS source
      FROM \
\`${config.projectId}.${config.dataset}.user_competitor_preferences\`
      WHERE IFNULL(active, TRUE) = TRUE
    ),
    combined AS (
      SELECT * FROM private
      UNION ALL
      SELECT * FROM user_defined
    )
    SELECT
      username,
      ANY_VALUE(drive_folder_id) AS drive_folder_id,
      ANY_VALUE(category) AS category,
      MIN(priority) AS priority,
      MAX(active) AS active,
      MIN(source) AS source
    FROM combined
    WHERE active = TRUE
    GROUP BY username
    ORDER BY priority, username
  `;

  const [rows] = await client.query(query, { location: config.location });
  return rows.map((row) => ({
    username: row.username as string,
    driveFolderId: row.drive_folder_id as string | undefined,
    category: row.category as string | undefined,
    priority: Number(row.priority ?? 999),
    active: Boolean(row.active ?? true),
    source: (row.source ?? 'private') as 'private' | 'user',
  }));
}

