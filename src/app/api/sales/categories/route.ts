import { NextResponse } from 'next/server';
import { getChargeCategories, setChargeCategory, autoCategorizeCharges, SALES_CATEGORIES, type SalesCategoryId } from '@/lib/sales/categories';

/**
 * GET /api/sales/categories?chargeIds=id1,id2,id3
 * 指定されたcharge_idのカテゴリを取得
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chargeIdsParam = searchParams.get('chargeIds');

  if (!chargeIdsParam) {
    return NextResponse.json({ error: 'chargeIds parameter is required' }, { status: 400 });
  }

  try {
    const chargeIds = chargeIdsParam.split(',').filter(Boolean);
    const categories = await getChargeCategories(chargeIds);

    // MapをObjectに変換
    const result: Record<string, string | null> = {};
    for (const id of chargeIds) {
      result[id] = categories.get(id) ?? null;
    }

    return NextResponse.json({
      categories: result,
      availableCategories: SALES_CATEGORIES,
    });
  } catch (error) {
    console.error('[api/sales/categories] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sales/categories
 * カテゴリを保存
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chargeId, category } = body as { chargeId: string; category: SalesCategoryId };

    if (!chargeId || !category) {
      return NextResponse.json({ error: 'chargeId and category are required' }, { status: 400 });
    }

    // カテゴリが有効かチェック
    const validCategories = SALES_CATEGORIES.map(c => c.id);
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    await setChargeCategory(chargeId, category);

    // 同じ顧客名+金額の未設定chargeにも自動適用
    const autoCategorized = await autoCategorizeCharges();

    return NextResponse.json({ success: true, chargeId, category, autoCategorized });
  } catch (error) {
    console.error('[api/sales/categories] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save category' },
      { status: 500 }
    );
  }
}
