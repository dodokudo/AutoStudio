/**
 * UnivaPay API Client
 * https://docs.univapay.com/
 */

const UNIVAPAY_API_URL = process.env.UNIVAPAY_API_URL ?? 'https://api.univapay.com';
const UNIVAPAY_JWT = process.env.UNIVAPAY_JWT ?? '';
const UNIVAPAY_SECRET = process.env.UNIVAPAY_SECRET ?? '';
const UNIVAPAY_STORE_ID = process.env.UNIVAPAY_STORE_ID ?? '';

export interface UnivaPayCharge {
  id: string;
  store_id: string;
  transaction_token_id: string;
  requested_amount: number;
  requested_currency: string;
  charged_amount: number;
  charged_currency: string;
  status: 'pending' | 'awaiting' | 'successful' | 'failed' | 'error' | 'authorized' | 'canceled';
  metadata?: Record<string, string>;
  mode: 'live' | 'test';
  created_on: string;
  descriptor?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface UnivaPaySubscription {
  id: string;
  store_id: string;
  transaction_token_id: string;
  amount: number;
  currency: string;
  status: 'unverified' | 'unconfirmed' | 'canceled' | 'unpaid' | 'suspended' | 'current' | 'completed';
  period: string;
  initial_amount?: number;
  next_payment_date?: string;
  metadata?: Record<string, string>;
  mode: 'live' | 'test';
  created_on: string;
}

export interface UnivaPayListResponse<T> {
  items: T[];
  has_more: boolean;
  total_hits?: number;
}

export interface ListChargesParams {
  from?: string;
  to?: string;
  status?: string;
  mode?: 'live' | 'test';
  limit?: number;
  cursor?: string;
}

export interface ListSubscriptionsParams {
  status?: string;
  mode?: 'live' | 'test';
  limit?: number;
  cursor?: string;
}

function getAuthHeader(): string {
  return `Bearer ${UNIVAPAY_SECRET}.${UNIVAPAY_JWT}`;
}

async function fetchUnivaPay<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(endpoint, UNIVAPAY_API_URL);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': getAuthHeader(),
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`UnivaPay API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * 課金一覧を取得
 */
export async function listCharges(
  params?: ListChargesParams,
): Promise<UnivaPayListResponse<UnivaPayCharge>> {
  const storeId = UNIVAPAY_STORE_ID;
  if (!storeId) {
    throw new Error('UNIVAPAY_STORE_ID is not configured');
  }

  return fetchUnivaPay<UnivaPayListResponse<UnivaPayCharge>>(
    `/stores/${storeId}/charges`,
    params as Record<string, string | number | undefined>,
  );
}

/**
 * 課金詳細を取得
 */
export async function getCharge(chargeId: string): Promise<UnivaPayCharge> {
  const storeId = UNIVAPAY_STORE_ID;
  if (!storeId) {
    throw new Error('UNIVAPAY_STORE_ID is not configured');
  }

  return fetchUnivaPay<UnivaPayCharge>(`/stores/${storeId}/charges/${chargeId}`);
}

/**
 * 定期課金一覧を取得
 */
export async function listSubscriptions(
  params?: ListSubscriptionsParams,
): Promise<UnivaPayListResponse<UnivaPaySubscription>> {
  const storeId = UNIVAPAY_STORE_ID;
  if (!storeId) {
    throw new Error('UNIVAPAY_STORE_ID is not configured');
  }

  return fetchUnivaPay<UnivaPayListResponse<UnivaPaySubscription>>(
    `/stores/${storeId}/subscriptions`,
    params as Record<string, string | number | undefined>,
  );
}

/**
 * 売上サマリーを取得（期間指定）
 */
export async function getSalesSummary(
  startDate: string,
  endDate: string,
): Promise<{
  totalAmount: number;
  successfulCount: number;
  failedCount: number;
  pendingCount: number;
  charges: UnivaPayCharge[];
}> {
  const result = await listCharges({
    from: startDate,
    to: endDate,
    mode: 'live',
  });

  const charges = result.items;

  const successful = charges.filter(c => c.status === 'successful');
  const failed = charges.filter(c => c.status === 'failed' || c.status === 'error');
  const pending = charges.filter(c => c.status === 'pending' || c.status === 'awaiting');

  return {
    totalAmount: successful.reduce((sum, c) => sum + c.charged_amount, 0),
    successfulCount: successful.length,
    failedCount: failed.length,
    pendingCount: pending.length,
    charges,
  };
}
