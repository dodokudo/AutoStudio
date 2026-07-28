import { NextResponse } from 'next/server';
import {
  CUSTOMER_STATUSES,
  getCustomerProfiles,
  upsertCustomerProfile,
  type CustomerStatus,
} from '@/lib/sales/customerProfiles';

export async function GET() {
  try {
    return NextResponse.json({ profiles: await getCustomerProfiles() });
  } catch (error) {
    console.error('[api/sales/customers] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch customer profiles' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const customerKey = String(body.customerKey ?? '').trim();
    const status = String(body.status ?? 'needs_review') as CustomerStatus;

    if (!customerKey) {
      return NextResponse.json({ error: 'customerKey is required' }, { status: 400 });
    }
    if (!CUSTOMER_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const profile = {
      customerKey,
      displayName: String(body.displayName ?? '').trim(),
      status,
      courseName: String(body.courseName ?? '').trim(),
      lineDisplayName: String(body.lineDisplayName ?? '').trim(),
      aliases: Array.isArray(body.aliases)
        ? body.aliases.map((value: unknown) => String(value).trim()).filter(Boolean)
        : [],
    };

    await upsertCustomerProfile(profile);
    return NextResponse.json({
      success: true,
      profile: {
        ...profile,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[api/sales/customers] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update customer profile' }, { status: 500 });
  }
}
