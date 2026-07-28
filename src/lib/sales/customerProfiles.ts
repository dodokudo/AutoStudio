import { createBigQueryClient, resolveProjectId } from '../bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_sales';
const TABLE = 'customer_profiles';

export const CUSTOMER_STATUSES = [
  'contracting',
  'active',
  'paused',
  'cancelled',
  'needs_review',
] as const;

export type CustomerStatus = typeof CUSTOMER_STATUSES[number];

export interface CustomerProfile {
  customerKey: string;
  displayName: string;
  status: CustomerStatus;
  courseName: string;
  lineDisplayName: string;
  aliases: string[];
  updatedAt: string;
}

async function ensureCustomerProfilesTable(): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);
  const dataset = client.dataset(DATASET);
  const table = dataset.table(TABLE);
  const [exists] = await table.exists();
  if (exists) return;

  await table.create({
    schema: {
      fields: [
        { name: 'customer_key', type: 'STRING', mode: 'REQUIRED' },
        { name: 'display_name', type: 'STRING' },
        { name: 'status', type: 'STRING' },
        { name: 'course_name', type: 'STRING' },
        { name: 'line_display_name', type: 'STRING' },
        { name: 'aliases_json', type: 'STRING' },
        { name: 'updated_at', type: 'TIMESTAMP' },
      ],
    },
  });
}

export async function getCustomerProfiles(): Promise<CustomerProfile[]> {
  const client = createBigQueryClient(PROJECT_ID);

  try {
    const [rows] = await client.query({
      query: `
        SELECT
          customer_key,
          display_name,
          status,
          course_name,
          line_display_name,
          aliases_json,
          FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', updated_at) AS updated_at
        FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
        ORDER BY display_name
      `,
    });

    return (rows as Array<Record<string, unknown>>).map((row) => {
      let aliases: string[] = [];
      try {
        aliases = JSON.parse(String(row.aliases_json ?? '[]')) as string[];
      } catch {
        aliases = [];
      }

      return {
        customerKey: String(row.customer_key),
        displayName: String(row.display_name ?? ''),
        status: String(row.status ?? 'needs_review') as CustomerStatus,
        courseName: String(row.course_name ?? ''),
        lineDisplayName: String(row.line_display_name ?? ''),
        aliases,
        updatedAt: String(row.updated_at ?? ''),
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Not found') || message.includes('not found')) {
      return [];
    }
    throw error;
  }
}

export async function upsertCustomerProfile(
  profile: Omit<CustomerProfile, 'updatedAt'>,
): Promise<void> {
  await ensureCustomerProfilesTable();
  const client = createBigQueryClient(PROJECT_ID);

  await client.query({
    query: `
      MERGE \`${PROJECT_ID}.${DATASET}.${TABLE}\` T
      USING (
        SELECT
          @customerKey AS customer_key,
          @displayName AS display_name,
          @status AS status,
          @courseName AS course_name,
          @lineDisplayName AS line_display_name,
          @aliasesJson AS aliases_json,
          CURRENT_TIMESTAMP() AS updated_at
      ) S
      ON T.customer_key = S.customer_key
      WHEN MATCHED THEN UPDATE SET
        display_name = S.display_name,
        status = S.status,
        course_name = S.course_name,
        line_display_name = S.line_display_name,
        aliases_json = S.aliases_json,
        updated_at = S.updated_at
      WHEN NOT MATCHED THEN INSERT (
        customer_key,
        display_name,
        status,
        course_name,
        line_display_name,
        aliases_json,
        updated_at
      ) VALUES (
        S.customer_key,
        S.display_name,
        S.status,
        S.course_name,
        S.line_display_name,
        S.aliases_json,
        S.updated_at
      )
    `,
    params: {
      customerKey: profile.customerKey,
      displayName: profile.displayName,
      status: profile.status,
      courseName: profile.courseName,
      lineDisplayName: profile.lineDisplayName,
      aliasesJson: JSON.stringify(profile.aliases),
    },
  });
}
