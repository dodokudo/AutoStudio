import { NextResponse } from 'next/server';
import { addExpense, deleteExpense, getExpenses } from '@/lib/sales/expenses';
import {
  EXPENSE_BUSINESS_UNITS,
  EXPENSE_CATEGORIES,
  EXPENSE_TYPES,
  type ExpenseBusinessUnitId,
  type ExpenseCategoryId,
  type ExpenseTypeId,
} from '@/lib/sales/expenseTypes';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('start');
  const endDate = searchParams.get('end');

  if (!startDate || !endDate || !DATE_PATTERN.test(startDate) || !DATE_PATTERN.test(endDate)) {
    return NextResponse.json({ error: 'start/end (YYYY-MM-DD) are required' }, { status: 400 });
  }

  try {
    const expenses = await getExpenses(startDate, endDate);
    return NextResponse.json(
      { success: true, expenses },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('[api/sales/expenses] GET Error:', error);
    return NextResponse.json({ error: 'Failed to load expenses' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      amount?: number;
      category?: ExpenseCategoryId;
      expenseType?: ExpenseTypeId;
      businessUnit?: ExpenseBusinessUnitId;
      description?: string;
      expenseDate?: string;
    };
    const validCategories = new Set(EXPENSE_CATEGORIES.map((item) => item.id));
    const validTypes = new Set(EXPENSE_TYPES.map((item) => item.id));
    const validBusinessUnits = new Set(EXPENSE_BUSINESS_UNITS.map((item) => item.id));

    if (
      !Number.isFinite(body.amount) ||
      Number(body.amount) <= 0 ||
      !body.category ||
      !validCategories.has(body.category) ||
      !body.expenseType ||
      !validTypes.has(body.expenseType) ||
      !body.businessUnit ||
      !validBusinessUnits.has(body.businessUnit) ||
      !body.expenseDate ||
      !DATE_PATTERN.test(body.expenseDate)
    ) {
      return NextResponse.json({ error: 'Invalid expense data' }, { status: 400 });
    }

    const expense = await addExpense({
      amount: Math.round(Number(body.amount)),
      category: body.category,
      expenseType: body.expenseType,
      businessUnit: body.businessUnit,
      description: body.description?.trim() ?? '',
      expenseDate: body.expenseDate,
    });
    return NextResponse.json({ success: true, expense });
  } catch (error) {
    console.error('[api/sales/expenses] POST Error:', error);
    return NextResponse.json({ error: 'Failed to add expense' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    await deleteExpense(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/sales/expenses] DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}
