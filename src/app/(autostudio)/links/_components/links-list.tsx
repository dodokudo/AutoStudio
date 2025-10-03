'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ShortLink } from '@/lib/links/types';

export function LinksList() {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadLinks();
  }, []);

  const loadLinks = async () => {
    try {
      const response = await fetch('/api/links/list');
      if (response.ok) {
        const data = await response.json();
        setLinks(data);
      }
    } catch (error) {
      console.error('Failed to load links:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (link: ShortLink) => {
    const url = `${window.location.origin}/l/${link.shortCode}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
        <p className="text-sm text-[color:var(--color-text-secondary)]">読み込み中...</p>
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
        <p className="text-sm text-[color:var(--color-text-secondary)]">リンクがありません。上記のフォームから最初のリンクを作成してください。</p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">
                管理名
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">
                ジャンル
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">
                短縮リンク
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">
                リンク先
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">
                OGPタイトル
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">
                作成日
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-border)]">
            {links.map((link) => (
              <tr key={link.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <span className="text-sm text-[color:var(--color-text-primary)]">
                    {link.managementName || '-'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {link.category && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      {link.category === 'threads' && 'Threads'}
                      {link.category === 'instagram' && 'Instagram'}
                      {link.category === 'youtube' && 'YouTube'}
                      {link.category === 'ad' && '広告'}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-[color:var(--color-text-primary)]">
                      /l/{link.shortCode}
                    </code>
                    <button
                      onClick={() => copyToClipboard(link)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      {copiedId === link.id ? 'コピー済み' : 'コピー'}
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <a
                    href={link.destinationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline truncate max-w-xs block"
                  >
                    {link.destinationUrl}
                  </a>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-[color:var(--color-text-primary)]">
                    {link.title || '-'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-sm text-[color:var(--color-text-secondary)]">
                    {new Date(link.createdAt).toLocaleDateString()}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <Link
                    href={`/links/${link.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    統計を見る
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
