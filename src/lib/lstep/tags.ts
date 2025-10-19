import { createBigQueryClient } from '@/lib/bigquery';

const DEFAULT_DATASET = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
const TABLE_NAME = 'lstep_friends_raw';

export interface TagColumn {
  name: string;
  type: string;
  description?: string;
}

/**
 * lstep_friends_rawテーブルのすべてのカラムを取得
 */
export async function getLstepTableColumns(projectId: string): Promise<TagColumn[]> {
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  const dataset = client.dataset(DEFAULT_DATASET);
  const table = dataset.table(TABLE_NAME);

  const [metadata] = await table.getMetadata();
  const schema = metadata.schema;

  if (!schema || !schema.fields) {
    return [];
  }

  return schema.fields.map((field: { name: string; type: string; description?: string }) => ({
    name: field.name,
    type: field.type,
    description: field.description,
  }));
}

/**
 * ファネルステップとして使用可能なタグカラムを取得
 * （INT64型でバイナリフラグとして使われているカラム）
 */
export async function getAvailableTags(projectId: string): Promise<TagColumn[]> {
  const allColumns = await getLstepTableColumns(projectId);

  // 除外するシステムカラム
  const excludedColumns = [
    'id',
    'user_id',
    'name',
    'display_name',
    'friend_added_at',
    'snapshot_date',
    'created_at',
    'updated_at',
  ];

  // INT64型でシステムカラムでないものをタグとして扱う
  return allColumns.filter(
    (col) => col.type === 'INTEGER' && !excludedColumns.includes(col.name)
  );
}
