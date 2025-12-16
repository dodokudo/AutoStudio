import { NextResponse } from 'next/server';
import { getManualSales, addManualSale, deleteManualSale, SALES_CATEGORIES, type SalesCategoryId } from '@/lib/sales/categories';

/**
 * GET /api/sales/manual?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * 手動売上を取得
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  try {
    const sales = await getManualSales(startDate, endDate);
    return NextResponse.json({ sales, availableCategories: SALES_CATEGORIES });
  } catch (error) {
    console.error('[api/sales/manual] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch manual sales' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sales/manual
 * 手動売上を追加
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { amount, category, customerName, paymentMethod, note, transactionDate } = body as {
      amount: number;
      category: SalesCategoryId;
      customerName?: string;
      paymentMethod?: string;
      note?: string;
      transactionDate: string;
    };

    if (!amount || !category || !transactionDate) {
      return NextResponse.json(
        { error: 'amount, category, and transactionDate are required' },
        { status: 400 }
      );
    }

    // カテゴリが有効かチェック
    const validCategories = SALES_CATEGORIES.map(c => c.id);
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const id = await addManualSale({
      amount,
      category,
      customerName: customerName ?? '',
      paymentMethod: paymentMethod ?? '銀行振込',
      note: note ?? '',
      transactionDate,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('[api/sales/manual] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add manual sale' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sales/manual?id=xxx
 * 手動売上を削除
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    await deleteManualSale(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/sales/manual] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete manual sale' },
      { status: 500 }
    );
  }
}
