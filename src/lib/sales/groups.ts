/**
 * 取引グループ管理
 * カード決済と銀行振込を1つの取引としてグループ化
 */
import { createBigQueryClient, resolveProjectId } from '../bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_sales';

export interface TransactionGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface TransactionGroupItem {
  groupId: string;
  itemType: 'charge' | 'manual';
  itemId: string;
}

/**
 * グループ関連テーブルを初期化
 */
export async function initGroupTables(): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);
  const dataset = client.dataset(DATASET);

  // transaction_groups テーブル
  const groupsTable = dataset.table('transaction_groups');
  const [groupsExists] = await groupsTable.exists();
  if (!groupsExists) {
    await groupsTable.create({
      schema: {
        fields: [
          { name: 'id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'name', type: 'STRING' },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
    });
    console.log('[groups] Created table: transaction_groups');
  }

  // transaction_group_items テーブル
  const itemsTable = dataset.table('transaction_group_items');
  const [itemsExists] = await itemsTable.exists();
  if (!itemsExists) {
    await itemsTable.create({
      schema: {
        fields: [
          { name: 'group_id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'item_type', type: 'STRING', mode: 'REQUIRED' },
          { name: 'item_id', type: 'STRING', mode: 'REQUIRED' },
        ],
      },
    });
    console.log('[groups] Created table: transaction_group_items');
  }
}

/**
 * 新しいグループを作成
 */
export async function createGroup(name: string, items: Array<{ type: 'charge' | 'manual'; id: string }>): Promise<string> {
  const client = createBigQueryClient(PROJECT_ID);
  const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // グループを作成
  await client.query({
    query: `
      INSERT INTO \`${PROJECT_ID}.${DATASET}.transaction_groups\`
      (id, name, created_at)
      VALUES (@groupId, @name, CURRENT_TIMESTAMP())
    `,
    params: { groupId, name },
  });

  // アイテムを紐付け
  if (items.length > 0) {
    const values = items.map((_, i) => `(@groupId, @type${i}, @id${i})`).join(', ');
    const params: Record<string, string> = { groupId };
    items.forEach((item, i) => {
      params[`type${i}`] = item.type;
      params[`id${i}`] = item.id;
    });

    await client.query({
      query: `
        INSERT INTO \`${PROJECT_ID}.${DATASET}.transaction_group_items\`
        (group_id, item_type, item_id)
        VALUES ${values}
      `,
      params,
    });
  }

  return groupId;
}

/**
 * グループにアイテムを追加
 */
export async function addItemsToGroup(groupId: string, items: Array<{ type: 'charge' | 'manual'; id: string }>): Promise<void> {
  if (items.length === 0) return;

  const client = createBigQueryClient(PROJECT_ID);

  for (const item of items) {
    await client.query({
      query: `
        INSERT INTO \`${PROJECT_ID}.${DATASET}.transaction_group_items\`
        (group_id, item_type, item_id)
        VALUES (@groupId, @itemType, @itemId)
      `,
      params: { groupId, itemType: item.type, itemId: item.id },
    });
  }
}

/**
 * グループを解除（削除）
 */
export async function deleteGroup(groupId: string): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);

  await client.query({
    query: `DELETE FROM \`${PROJECT_ID}.${DATASET}.transaction_group_items\` WHERE group_id = @groupId`,
    params: { groupId },
  });

  await client.query({
    query: `DELETE FROM \`${PROJECT_ID}.${DATASET}.transaction_groups\` WHERE id = @groupId`,
    params: { groupId },
  });
}

/**
 * 全グループとアイテムを取得
 */
export async function getAllGroups(): Promise<Map<string, { group: TransactionGroup; items: TransactionGroupItem[] }>> {
  const client = createBigQueryClient(PROJECT_ID);

  // グループ一覧
  const [groupRows] = await client.query({
    query: `
      SELECT id, name, FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at
      FROM \`${PROJECT_ID}.${DATASET}.transaction_groups\`
    `,
  });

  // アイテム一覧
  const [itemRows] = await client.query({
    query: `
      SELECT group_id, item_type, item_id
      FROM \`${PROJECT_ID}.${DATASET}.transaction_group_items\`
    `,
  });

  const result = new Map<string, { group: TransactionGroup; items: TransactionGroupItem[] }>();

  for (const row of groupRows as Array<{ id: string; name: string; created_at: string }>) {
    result.set(row.id, {
      group: {
        id: row.id,
        name: row.name ?? '',
        createdAt: row.created_at,
      },
      items: [],
    });
  }

  for (const row of itemRows as Array<{ group_id: string; item_type: string; item_id: string }>) {
    const group = result.get(row.group_id);
    if (group) {
      group.items.push({
        groupId: row.group_id,
        itemType: row.item_type as 'charge' | 'manual',
        itemId: row.item_id,
      });
    }
  }

  return result;
}

/**
 * アイテムIDからグループIDを取得するマップを作成
 */
export async function getItemToGroupMap(): Promise<Map<string, string>> {
  const client = createBigQueryClient(PROJECT_ID);

  try {
    const [rows] = await client.query({
      query: `
        SELECT item_id, group_id
        FROM \`${PROJECT_ID}.${DATASET}.transaction_group_items\`
      `,
    });

    const map = new Map<string, string>();
    for (const row of rows as Array<{ item_id: string; group_id: string }>) {
      map.set(row.item_id, row.group_id);
    }
    return map;
  } catch {
    // テーブルがない場合は空のマップを返す
    return new Map();
  }
}

/**
 * グループ名を更新
 */
export async function updateGroupName(groupId: string, name: string): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);

  await client.query({
    query: `
      UPDATE \`${PROJECT_ID}.${DATASET}.transaction_groups\`
      SET name = @name
      WHERE id = @groupId
    `,
    params: { groupId, name },
  });
}
