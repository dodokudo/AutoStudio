import { createBigQueryClient, resolveProjectId } from '../bigquery';

const PROJECT_ID = resolveProjectId();

const ANALYCA_DISPLAY_NAMES_BY_USERNAME: Record<string, string> = {
  akirauchiyama_saa: '内山明',
  mitsuyo_5: '吉岡光代',
  'hanarabi.mama24': '眞下渚',
  dr_sara_yubishaburi: '鬼谷 薫',
  keiko_detox: '焼石啓子',
  moto_donzokochan__: '寺井 はるか',
  moyawork: 'アオノ ナオ',
  hattatsukaizenkei: '千田めぐみ',
  yayoi_yuruyakarich: '佐藤弥生',
};

export interface AnalycaCustomerIdentity {
  userId: string;
  subscriptionId: string | null;
  transactionTokenId: string | null;
  displayName: string | null;
  lineName: string | null;
  threadsUsername: string | null;
  instagramUsername: string | null;
  email: string | null;
}

export async function getAnalycaCustomerIdentities(): Promise<AnalycaCustomerIdentity[]> {
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `
      WITH latest_entries AS (
        SELECT
          analyca_user_id_at_entry,
          normalized_threads_username,
          NULLIF(TRIM(line_name), '') AS line_name,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(analyca_user_id_at_entry, normalized_threads_username)
            ORDER BY updated_at DESC
          ) AS row_number
        FROM \`${PROJECT_ID}.analyca.threads_grandprix_entries\`
      )
      SELECT
        CAST(u.user_id AS STRING) AS user_id,
        CAST(u.subscription_id AS STRING) AS subscription_id,
        CAST(u.transaction_token_id AS STRING) AS transaction_token_id,
        NULLIF(TRIM(e.line_name), '') AS line_name,
        NULLIF(TRIM(u.threads_username), '') AS threads_username,
        NULLIF(TRIM(u.instagram_username), '') AS instagram_username,
        NULLIF(TRIM(u.email), '') AS email
      FROM \`${PROJECT_ID}.analyca.users\` u
      LEFT JOIN latest_entries e
        ON e.row_number = 1
       AND (
         e.analyca_user_id_at_entry = CAST(u.user_id AS STRING)
         OR (
           e.analyca_user_id_at_entry IS NULL
           AND e.normalized_threads_username = LOWER(REGEXP_REPLACE(u.threads_username, r'^@', ''))
         )
       )
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY u.user_id
        ORDER BY e.line_name IS NOT NULL DESC
      ) = 1
    `,
  });

  return (rows as Array<Record<string, unknown>>).map((row) => {
    const threadsUsername = row.threads_username ? String(row.threads_username) : null;
    const instagramUsername = row.instagram_username ? String(row.instagram_username) : null;
    const username = (threadsUsername || instagramUsername || '')
      .replace(/^@/, '')
      .toLowerCase();

    return {
      userId: String(row.user_id),
      subscriptionId: row.subscription_id ? String(row.subscription_id) : null,
      transactionTokenId: row.transaction_token_id ? String(row.transaction_token_id) : null,
      displayName: ANALYCA_DISPLAY_NAMES_BY_USERNAME[username] ?? null,
      lineName: row.line_name ? String(row.line_name) : null,
      threadsUsername,
      instagramUsername,
      email: row.email ? String(row.email) : null,
    };
  });
}
