'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CreateLinkForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    shortCode: '',
    destinationUrl: '',
    title: '',
    description: '',
    ogpImageUrl: '',
    managementName: '',
    category: '' as '' | 'threads' | 'instagram' | 'youtube' | 'ad' | 'line',
  });

  const previewUrl = typeof window !== 'undefined' ? `${window.location.origin}/l/${formData.shortCode}` : '';
  const hasOgpData = formData.title || formData.description || formData.ogpImageUrl;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/links/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create link');
      }

      // Reset form
      setFormData({
        shortCode: '',
        destinationUrl: '',
        title: '',
        description: '',
        ogpImageUrl: '',
        managementName: '',
        category: '',
      });

      // Refresh the page to show new link
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
      <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">
        新規短縮リンク作成
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleSubmit} className="space-y-4 lg:col-span-2">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[color:var(--color-text-primary)] mb-1">
              管理名
            </label>
            <input
              type="text"
              value={formData.managementName}
              onChange={(e) => setFormData({ ...formData, managementName: e.target.value })}
              placeholder="2024年夏キャンペーン"
              className="w-full rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[color:var(--color-text-primary)] mb-1">
              ジャンル
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as '' | 'threads' | 'instagram' | 'youtube' | 'ad' | 'line' })}
              className="w-full rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">選択してください</option>
              <option value="threads">Threads</option>
              <option value="instagram">Instagram</option>
              <option value="youtube">YouTube</option>
              <option value="line">LINE</option>
              <option value="ad">広告</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[color:var(--color-text-primary)] mb-1">
              短縮コード <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[color:var(--color-text-secondary)]">
                {typeof window !== 'undefined' ? window.location.origin : ''}/l/
              </span>
              <input
                type="text"
                required
                value={formData.shortCode}
                onChange={(e) => setFormData({ ...formData, shortCode: e.target.value })}
                placeholder="summer-campaign"
                className="flex-1 rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
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
              placeholder="https://example.com"
              className="w-full rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[color:var(--color-text-primary)] mb-1">
            OGPタイトル
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Summer Campaign 2024"
            className="w-full rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[color:var(--color-text-primary)] mb-1">
            OGP説明文
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Limited time offer: 50% OFF"
            rows={2}
            className="w-full rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            placeholder="https://example.com/image.jpg"
            className="w-full rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-[color:var(--color-text-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? '作成中...' : 'リンク作成'}
          </button>
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
