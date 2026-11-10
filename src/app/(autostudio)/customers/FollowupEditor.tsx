'use client';
import { useState } from 'react';
import type { Customer } from '@/lib/customers/model';
import {
  EMPTY_FOLLOWUP,
  OFFER_LABELS,
  PROSPECT_LABELS,
  CLOSING_LABELS,
  closingRecord,
  type Followup,
} from '@/lib/customers/followup';
const input =
  'mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm';
export function FollowupEditor({
  customer,
  value,
  onSaved,
}: {
  customer: Customer;
  value?: Followup;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Followup>(value || EMPTY_FOLLOWUP);
  const [saving, setSaving] = useState(false),
    [message, setMessage] = useState('');
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const r = await fetch('/api/customers/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: customer.id, followup: draft }),
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.error || '保存できませんでした');
      setDraft(body.followup);
      setMessage('保存しました。');
      await onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存できませんでした');
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      onSubmit={save}
      className="mt-6 rounded-lg border border-gray-200 p-4"
    >
      <h3 className="font-semibold">相談・クロージング管理</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-gray-500">
          提案状況
          <select
            className={input}
            value={draft.offer}
            onChange={(e) =>
              setDraft({
                ...draft,
                offer: e.target.value as Followup['offer'],
                offeredDate:
                  e.target.value === 'offered' ? draft.offeredDate : '',
              })
            }
          >
            {Object.entries(OFFER_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          提案日
          <input
            className={input}
            type="date"
            disabled={draft.offer !== 'offered'}
            value={draft.offeredDate}
            onChange={(e) =>
              setDraft({ ...draft, offeredDate: e.target.value })
            }
          />
        </label>
        <label className="text-xs text-gray-500">
          見込み度（担当者判断）
          <select
            className={input}
            value={draft.prospect}
            onChange={(e) =>
              setDraft({
                ...draft,
                prospect: e.target.value as Followup['prospect'],
              })
            }
          >
            {Object.entries(PROSPECT_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          クロージング結果
          <select
            className={input}
            value={draft.closing || 'inherit'}
            onChange={(e) =>
              setDraft({
                ...draft,
                closing: e.target.value as Followup['closing'],
              })
            }
          >
            <option value="inherit">
              {closingRecord(customer).label}（元の記録）
            </option>
            {Object.entries(CLOSING_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-4 block text-xs text-gray-500">
        判断メモ
        <textarea
          className={input}
          rows={2}
          maxLength={500}
          value={draft.memo}
          onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
          placeholder="提案内容・返答・判断の理由"
        />
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={saving}
          className="rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {saving ? '保存中…' : '保存'}
        </button>
        <p role="status" className="text-xs text-gray-500">
          {message}
        </p>
      </div>
      {draft.updatedAt && (
        <p className="mt-3 text-xs text-gray-400">
          最終記録：
          {new Date(draft.updatedAt).toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
          })}
        </p>
      )}
    </form>
  );
}
