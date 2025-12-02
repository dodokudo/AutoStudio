'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ShortLink } from '@/lib/links/types';

interface EditLinkFormProps {
  linkId: string;
}

export function EditLinkForm({ linkId }: EditLinkFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    destinationUrl: '',
    title: '',
    description: '',
    ogpImageUrl: '',
    managementName: '',
    category: '' as '' | 'threads' | 'instagram' | 'youtube' | 'ad' | 'line',
  });

  const [shortCode, setShortCode] = useState('');

  useEffect(() => {
    loadLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  const loadLink = async () => {
    try {
      const response = await fetch('/api/links/list');
      if (response.ok) {
        const links: ShortLink[] = await response.json();
        const link = links.find((l) => l.id === linkId);
        if (link) {
          setFormData({
            destinationUrl: link.destinationUrl,
            title: link.title || '',
            description: link.description || '',
            ogpImageUrl: link.ogpImageUrl || '',
            managementName: link.managementName || '',
            category: link.category || '',
          });
          setShortCode(link.shortCode);
        }
      }
    } catch (error) {
      console.error('Failed to load link:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/links/${linkId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push('/links');
        router.refresh();
      } else {
        const data = await response.json();
        setError(data.error || 'リンクの更新に失敗しました');
      }
    } catch (err) {
      console.error('Failed to update link:', err);
      setError('リンクの更新に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewUrl = typeof window !== 'undefined' ? `${window.location.origin}/l/${shortCode}` : '';
  const hasOgpData = formData.title || formData.description || formData.ogpImageUrl;

  if (isLoading) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
        <p className="text-sm text-[color:var(--color-text-secondary)]">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">リンク情報編集</h2>
        <Link href="/links" className="text-sm text-gray-600 hover:underline">
          リンク一覧に戻る
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleSubmit} className="space-y-4 lg:col-span-2">
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[color:var(--color-text-primary)] mb-1">
              短縮コード（変更不可）
            </label>
            <input
              type="text"
              value={shortCode}
              disabled
              className="w-full px-3 py-2 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] bg-gray-100 text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[color:var(--color-text-primary)] mb-1">
              リンク先URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              required
              value={formData.destinationUrl}
              onChange={(e) => setFormData({ ...formData, destinationUrl: e.target.value })}
              className="w-full px-3 py-2 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[color:var(--color-text-primary)] mb-1">
              管理名
            </label>
            <input
              type="text"
              value={formData.managementName}
              onChange={(e) => setFormData({ ...formData, managementName: e.target.value })}
              className="w-full px-3 py-2 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例: 2024年1月キャンペーン"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[color:var(--color-text-primary)] mb-1">
              ジャンル
            </label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  category: e.target.value as '' | 'threads' | 'instagram' | 'youtube' | 'ad' | 'line',
                })
              }
              className="w-full px-3 py-2 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">選択してください</option>
              <option value="threads">Threads</option>
              <option value="instagram">Instagram</option>
              <option value="youtube">YouTube</option>
              <option value="line">LINE</option>
              <option value="ad">広告</option>
            </select>
          </div>

          <div className="border-t border-[color:var(--color-border)] pt-4">
            <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)] mb-3">OGP設定</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text-primary)] mb-1">
                  タイトル
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="SNSでシェアされたときに表示されるタイトル"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text-primary)] mb-1">
                  説明文
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="SNSでシェアされたときに表示される説明文"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--color-text-primary)] mb-1">
                  OGP画像URL
                </label>
                <input
                  type="url"
                  value={formData.ogpImageUrl}
                  onChange={(e) => setFormData({ ...formData, ogpImageUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/image.jpg"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-[var(--radius-sm)] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '更新中...' : '更新する'}
            </button>
            <Link
              href="/links"
              className="px-4 py-2 border border-[color:var(--color-border)] rounded-[var(--radius-sm)] hover:bg-gray-50"
            >
              キャンセル
            </Link>
          </div>
        </form>

        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <p className="text-sm font-medium text-[color:var(--color-text-primary)] mb-3">OGPプレビュー</p>
            {hasOgpData ? (
              <div className="rounded-md border border-[color:var(--color-border)] bg-white overflow-hidden">
                {formData.ogpImageUrl && (
                  <div className="w-full aspect-[1.91/1] bg-gray-100 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={formData.ogpImageUrl}
                      alt="OGP Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <div className="p-3">
                  <div className="text-xs text-gray-500 mb-1 truncate">{previewUrl || 'URL未設定'}</div>
                  <div className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2">
                    {formData.title || '未設定'}
                  </div>
                  <div className="text-xs text-gray-600 line-clamp-2">
                    {formData.description || '説明文未設定'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                <p className="text-sm text-gray-500">OGP情報を入力するとプレビューが表示されます</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
