import { NextResponse } from 'next/server';
import {
  SALES_CATEGORIES,
  splitManualSale,
  type SalesCategoryId,
} from '@/lib/sales/categories';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parentSaleId = String(body.parentSaleId ?? '').trim();
    const splits = Array.isArray(body.splits) ? body.splits : [];
    const validCategories = new Set(SALES_CATEGORIES.map((category) => category.id));

    if (!parentSaleId || splits.length < 2) {
      return NextResponse.json(
        { error: 'parentSaleId and at least 2 splits are required' },
        { status: 400 }
      );
    }

    const normalizedSplits = splits.map((split: Record<string, unknown>) => ({
      amount: Number(split.amount),
      category: String(split.category) as SalesCategoryId,
      customerName: String(split.customerName ?? ''),
      note: String(split.note ?? ''),
    }));
    if (
      normalizedSplits.some(
        (split: { amount: number; category: SalesCategoryId }) =>
          !Number.isInteger(split.amount) ||
          split.amount <= 0 ||
          !validCategories.has(split.category)
      )
    ) {
      return NextResponse.json({ error: 'Invalid split data' }, { status: 400 });
    }

    await splitManualSale(parentSaleId, normalizedSplits);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/sales/manual/split] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to split manual sale' },
      { status: 500 }
    );
  }
}
