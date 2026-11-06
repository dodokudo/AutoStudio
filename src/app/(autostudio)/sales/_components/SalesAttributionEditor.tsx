'use client';

import { useId, useState } from 'react';
import { defaultAttribution, SALESPERSON_START, type CommissionRevenue, type SalesAttribution, type AttributionStatus } from '@/lib/sales/commissions';

export function SalesAttributionEditor({ item, attribution, attributions, onSaved }: {
  item: CommissionRevenue;
  attribution?: SalesAttribution;
  attributions: SalesAttribution[];
  onSaved: (value: SalesAttribution) => void;
}) {
  const [draft, setDraft] = useState(() => attribution ?? defaultAttribution(item));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const id = useId();
  const save = async () => {
    setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/sales/attributions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存できませんでした');
      setDraft(data.attribution); onSaved(data.attribution); setMessage('保存しました');
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存できませんでした'); }
    finally { setSaving(false); }
  };
  return <div className="space-y-3 rounded border border-[color:var(--color-border)] bg-white p-4">
    <p className="text-sm font-medium">{item.customerName || '購入者名未確認'} / {item.paymentDate} / ¥{item.amount.toLocaleString('ja-JP')}</p>
    <div className="flex flex-wrap items-start gap-6">
      {(['referral', 'salesperson'] as const).map((role) => {
        const statusKey = role === 'referral' ? 'referralStatus' : 'salespersonStatus';
        const nameKey = role === 'referral' ? 'referrerName' : 'salespersonName';
        const disabled = role === 'salesperson' && item.paymentDate < SALESPERSON_START;
        const names = [...new Set(attributions.map(row => row[nameKey]).filter(Boolean))];
        return <div key={role} className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${id}-${role}`}>{role === 'referral' ? '紹介者（20％）' : '営業担当（10％）'}</label>
          <select id={`${id}-${role}`} className="rounded border p-2" disabled={disabled || saving} value={disabled ? 'none' : draft[statusKey]} onChange={e => { setDraft({ ...draft, [statusKey]: e.target.value as AttributionStatus }); setMessage(''); }}>
            <option value="unknown">未設定</option><option value="none">なし</option><option value="assigned">あり</option>
          </select>
          {draft[statusKey] === 'assigned' && !disabled && <>
            <input aria-label={role === 'referral' ? '紹介者名' : '営業担当者名'} list={`${id}-${role}-names`} className="rounded border p-2" value={draft[nameKey]} disabled={saving} onChange={e => { setDraft({ ...draft, [nameKey]: e.target.value }); setMessage(''); }} />
            <datalist id={`${id}-${role}-names`}>{names.map(name => <option key={name} value={name} />)}</datalist>
          </>}
        </div>;
      })}
      <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" disabled={saving} onClick={save}>{saving ? '保存中' : '保存'}</button>
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
