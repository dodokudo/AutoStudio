import { NextRequest, NextResponse } from 'next/server';
import { createGroup, deleteGroup, getAllGroups, initGroupTables } from '@/lib/sales/groups';

export const dynamic = 'force-dynamic';

/**
 * GET: グループ一覧を取得
 */
export async function GET() {
  try {
    const groups = await getAllGroups();
    const result = Array.from(groups.entries()).map(([id, data]) => ({
      id,
      name: data.group.name,
      createdAt: data.group.createdAt,
      items: data.items,
    }));
    return NextResponse.json({ groups: result });
  } catch (error) {
    console.error('[sales/groups] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch groups' },
      { status: 500 }
    );
  }
}

/**
 * POST: 新しいグループを作成
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, items } = body as {
      name: string;
      items: Array<{ type: 'charge' | 'manual'; id: string }>;
    };

    if (!items || items.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 items required to create a group' },
        { status: 400 }
      );
    }

    // テーブル初期化（存在しない場合のみ）
    await initGroupTables();

    const groupId = await createGroup(name || '', items);
    return NextResponse.json({ id: groupId });
  } catch (error) {
    console.error('[sales/groups] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create group' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: グループを削除
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('id');

    if (!groupId) {
      return NextResponse.json(
        { error: 'Group ID required' },
        { status: 400 }
      );
    }

    await deleteGroup(groupId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[sales/groups] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete group' },
      { status: 500 }
    );
  }
}
