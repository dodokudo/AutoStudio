import { assessPaymentTag, type SalesCustomerLink } from '@/lib/sales/customerIdentity';

export function SalesCustomerIdentity({ links, paymentMethod = '' }: { links: SalesCustomerLink[]; paymentMethod?: string }) {
  if (!links.length) return null;
  const rows = [...new Map(links.map(link => [`${link.elmeId}:${link.lstepId}:${link.lineUserId}:${link.status}:${link.reason}`, link])).values()];
  const confirmed = rows.filter(link => link.status === 'confirmed');
  return <details className="mt-1 max-w-sm whitespace-normal text-xs font-normal text-[color:var(--color-text-secondary)]">
    <summary className="cursor-pointer text-blue-600">顧客ID（{confirmed.length === rows.length ? '連携済み' : '要確認'}）</summary>
    <div className="mt-2 space-y-3 rounded border border-[color:var(--color-border)] bg-white p-2">
      {rows.map(link => {
        const tagReason = link.paymentTagReason || assessPaymentTag(link.paymentTag, paymentMethod, new Date().toISOString());
        return <div key={link.revenueKey} className="space-y-1 break-all">
          {rows.length > 1 && <p>{link.customerName || link.revenueKey}</p>}
          <p>エルメID：{link.elmeId || '未確認'}</p>
          <p>LステップID：{link.lstepId || '未確認'}</p>
          <p>LINEユーザーID：{link.lineUserId || '未確認'}</p>
          {link.registeredDate && <p>エルメ登録日：{link.registeredDate}<br /><span className="text-[color:var(--color-text-muted)]">{link.dateEvidence}</span></p>}
          {link.reason && <p>{link.reason}</p>}
          {link.lstepId && <p>支払タグ：{tagReason || (link.paymentTag?.paymentMethod === 'bank' ? '銀行振込' : 'カード')} {link.paymentTag && `（${link.paymentTag.snapshotDate}時点）`}</p>}
          <p>照合日時：{new Date(link.matchedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
          {link.sources.map(source => source.startsWith('https://docs.google.com/')
            ? <a key={source} href={source} target="_blank" rel="noreferrer" className="block text-blue-600 underline">顧客管理シートの照合元</a>
            : <p key={source}>{source}</p>)}
        </div>;
      })}
    </div>
  </details>;
}
