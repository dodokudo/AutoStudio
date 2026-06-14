import { resolveProjectId, createBigQueryClient } from '@/lib/bigquery';

const DATASET_ID = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';

// 購入・成約の判定タグ（user_tags.tag_name の実値）
const FE_TAG = '3M:FE購入';
const BE_TAG = '3M:BE購入';
const CONTRACT_TAGS = ['TH：成約', 'TAI：成約', 'TAI2:購入'];

export interface AgencyDailyRow {
  date: string | null;
  agency: string;
  registrations: number;
  fePurchases: number;
  bePurchases: number;
  contracts: number;
}

export interface AgencySummary {
  agency: string;
  registrations: number;
  fePurchases: number;
  bePurchases: number;
  contracts: number;
}

export interface AgencyStats {
  updatedAt: string | null;
  summary: AgencySummary[];
  daily: AgencyDailyRow[];
}

interface RawRow {
  snapshot_date: { value: string } | string | null;
  reg_date: { value: string } | string | null;
  agency: string;
  registrations: number;
  fe_purchases: number;
  be_purchases: number;
  contracts: number;
}

function toDateString(value: RawRow['reg_date']): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.value;
}

export async function getAgencyStats(): Promise<AgencyStats> {
  const projectId = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID);
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  const table = (name: string) => `\`${projectId}.${DATASET_ID}.${name}\``;

  const [rows] = await client.query({
    query: `
      WITH info_latest AS (
        SELECT MAX(snapshot_date) AS sd FROM ${table('user_info')}
      ),
      core_latest AS (
        SELECT MAX(snapshot_date) AS sd FROM ${table('user_core')}
      ),
      tags_latest AS (
        SELECT MAX(snapshot_date) AS sd FROM ${table('user_tags')}
      ),
      agency_users AS (
        SELECT DISTINCT i.user_id, i.field_value AS agency
        FROM ${table('user_info')} i, info_latest
        WHERE i.snapshot_date = info_latest.sd
          AND i.field_name = '流入元'
      ),
      core AS (
        -- friend_added_at は "YYYY-MM-DD HH:MM:SS"（JST）の文字列。日付部分をそのまま使う
        SELECT
          c.user_id,
          SAFE.PARSE_DATE('%Y-%m-%d', SUBSTR(ANY_VALUE(c.friend_added_at), 1, 10)) AS reg_date
        FROM ${table('user_core')} c, core_latest
        WHERE c.snapshot_date = core_latest.sd
        GROUP BY c.user_id
      ),
      purchases AS (
        SELECT
          t.user_id,
          MAX(IF(t.tag_name = @feTag AND t.tag_flag = 1, 1, 0)) AS fe,
          MAX(IF(t.tag_name = @beTag AND t.tag_flag = 1, 1, 0)) AS be,
          MAX(IF(t.tag_name IN UNNEST(@contractTags) AND t.tag_flag = 1, 1, 0)) AS contracted
        FROM ${table('user_tags')} t, tags_latest
        WHERE t.snapshot_date = tags_latest.sd
          AND t.tag_name IN UNNEST(@allTags)
        GROUP BY t.user_id
      )
      SELECT
        (SELECT sd FROM info_latest) AS snapshot_date,
        a.agency,
        c.reg_date,
        COUNT(*) AS registrations,
        SUM(COALESCE(p.fe, 0)) AS fe_purchases,
        SUM(COALESCE(p.be, 0)) AS be_purchases,
        SUM(COALESCE(p.contracted, 0)) AS contracts
      FROM agency_users a
      LEFT JOIN core c USING (user_id)
      LEFT JOIN purchases p USING (user_id)
      GROUP BY a.agency, c.reg_date
      ORDER BY c.reg_date DESC
    `,
    params: {
      feTag: FE_TAG,
      beTag: BE_TAG,
      contractTags: CONTRACT_TAGS,
      allTags: [FE_TAG, BE_TAG, ...CONTRACT_TAGS],
    },
  });

  const rawRows = rows as RawRow[];

  const daily: AgencyDailyRow[] = rawRows.map((row) => ({
    date: toDateString(row.reg_date),
    agency: row.agency,
    registrations: Number(row.registrations ?? 0),
    fePurchases: Number(row.fe_purchases ?? 0),
    bePurchases: Number(row.be_purchases ?? 0),
    contracts: Number(row.contracts ?? 0),
  }));

  const summaryMap = new Map<string, AgencySummary>();
  for (const row of daily) {
    const entry = summaryMap.get(row.agency) ?? {
      agency: row.agency,
      registrations: 0,
      fePurchases: 0,
      bePurchases: 0,
      contracts: 0,
    };
    entry.registrations += row.registrations;
    entry.fePurchases += row.fePurchases;
    entry.bePurchases += row.bePurchases;
    entry.contracts += row.contracts;
    summaryMap.set(row.agency, entry);
  }

  const summary = Array.from(summaryMap.values()).sort(
    (a, b) => b.registrations - a.registrations || b.fePurchases - a.fePurchases,
  );

  const updatedAt = rawRows.length > 0 ? toDateString(rawRows[0].snapshot_date) : null;

  return { updatedAt, summary, daily };
}
