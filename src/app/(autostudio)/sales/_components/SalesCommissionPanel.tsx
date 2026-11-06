'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { calculateCommission, defaultAttribution, SALESPERSON_START, type CommissionRevenue, type SalesAttribution, type AttributionStatus } from '@/lib/sales/commissions';

export function SalesCommissionPanel({ items, attributions, onSaved }: {
  items: CommissionRevenue[];
  attributions: SalesAttribution[];
  onSaved: (value: SalesAttribution) => void;
}) {
  const [editing, setEditing] = useState<SalesAttribution | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [onlyPending, setOnlyPending] = useState(true);
  const map = useMemo(() => new Map(attributions.map((a) => [a.revenueKey, a])), [attributions]);
  const rows = items.map((item) => ({ item, ...calculateCommission(item, map.get(item.revenueKey ?? item.id)) }));
  const payouts = new Map<string, number>();
  for (const row of rows) {
    if (row.referral) payouts.set(`紹介：${row.attribution.referrerName}`, (payouts.get(`紹介：${row.attribution.referrerName}`) ?? 0) + row.referral);
    if (row.salesperson) payouts.set(`営業：${row.attribution.salespersonName}`, (payouts.get(`営業：${row.attribution.salespersonName}`) ?? 0) + row.salesperson);
  }
  const editingItem = items.find((item) => (item.revenueKey ?? item.id) === editing?.revenueKey);
  const save = async () => {
    if (!editing) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/sales/attributions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存できませんでした');
      onSaved(data.attribution); setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : '保存できませんでした'); }
    finally { setSaving(false); }
  };
  return <Card className="p-6">
    <h2 className="text-lg font-semibold">販売経由・支払報酬</h2>
    <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">紹介20％・営業10％。各回の決済・入金額を基準に計算します。営業担当は現在なし。決まった後に、2026年11月以降の対象売上へ設定できます。</p>
    <div className="mt-4 flex flex-wrap gap-4 text-sm">
      <span>紹介報酬 ¥{rows.reduce((sum, row) => sum + row.referral, 0).toLocaleString('ja-JP')}</span>
      <span>営業報酬 ¥{rows.reduce((sum, row) => sum + row.salesperson, 0).toLocaleString('ja-JP')}</span>
      <span>経由未確認 {rows.filter((row) => row.pending).length}件</span>
    </div>
    {payouts.size > 0 && <div className="mt-3 space-y-1 text-sm">{[...payouts].map(([name, amount]) => <p key={name}>{name}：¥{amount.toLocaleString('ja-JP')}</p>)}<p className="text-xs text-[color:var(--color-text-muted)]">支払予定額です。支払済み経費との照合・実際の送金は別途行ってください。</p></div>}
    <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />未確認のみ表示</label>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {editing && <div className="mt-4 space-y-3 rounded border border-[color:var(--color-border)] p-4">
      <p className="font-medium">{editingItem?.customerName || '購入者名未確認'} / {editingItem?.paymentDate} / ¥{editingItem?.amount.toLocaleString('ja-JP')}</p>
      {(['referral', 'salesperson'] as const).map((role) => {
        const statusKey = role === 'referral' ? 'referralStatus' : 'salespersonStatus';
        const nameKey = role === 'referral' ? 'referrerName' : 'salespersonName';
        const disabled = role === 'salesperson' && !!editingItem && editingItem.paymentDate < SALESPERSON_START;
        return <div key={role} className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${role}-status`}>{role === 'referral' ? '紹介者（20％）' : '営業担当（10％）'}</label>
          <select id={`${role}-status`} className="rounded border p-2" disabled={disabled || saving} value={disabled ? 'none' : editing[statusKey]} onChange={(e) => setEditing({ ...editing, [statusKey]: e.target.value as AttributionStatus })}>
            <option value="unknown">未確認</option><option value="none">なし</option><option value="assigned">あり</option>
          </select>
          {editing[statusKey] === 'assigned' && !disabled && <input aria-label={role === 'referral' ? '紹介者名' : '営業担当者名'} className="rounded border p-2" value={editing[nameKey]} disabled={saving} onChange={(e) => setEditing({ ...editing, [nameKey]: e.target.value })} />}
          {disabled && <span className="text-xs">10月以前は営業報酬なし</span>}
        </div>;
      })}
      <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={saving} onClick={save}>{saving ? '保存中' : '保存'}</button>
      <button className="ml-3 text-sm" disabled={saving} onClick={() => setEditing(null)}>閉じる</button>
    </div>}
    <div className="mt-4 max-h-96 overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">決済・入金日</th><th className="p-2">購入者</th><th className="p-2">売上</th><th className="p-2">紹介者</th><th className="p-2">営業担当</th><th className="p-2">報酬合計</th><th /></tr></thead><tbody>
      {rows.filter((row) => !onlyPending || row.pending).sort((a, b) => b.item.paymentDate.localeCompare(a.item.paymentDate)).map((row) => <tr key={row.attribution.revenueKey} className="border-b">
        <td className="p-2">{row.item.paymentDate}</td><td className="p-2">{row.item.customerName || '購入者名未確認'}</td><td className="p-2">¥{row.item.amount.toLocaleString('ja-JP')}</td>
        <td className="p-2">{row.attribution.referralStatus === 'assigned' ? row.attribution.referrerName : row.attribution.referralStatus === 'none' ? 'なし' : '未確認'}</td>
        <td className="p-2">{row.attribution.salespersonStatus === 'assigned' ? row.attribution.salespersonName : row.attribution.salespersonStatus === 'none' ? 'なし' : '未確認'}</td>
        <td className="p-2">{row.pending ? '未確定' : `¥${row.total.toLocaleString('ja-JP')}`}</td><td className="p-2"><button className="text-blue-600" onClick={() => { setEditing(map.get(row.item.revenueKey ?? row.item.id) ?? defaultAttribution(row.item)); setError(''); }}>設定</button></td>
      </tr>)}
    </tbody></table></div>
  </Card>;
}
