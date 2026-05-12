'use client';

import { useState } from 'react';

interface Props {
  lpId: string;
}

export function TrackingSnippet({ lpId }: Props) {
  const [copied, setCopied] = useState(false);

  const configSnippet = `<script>
  window.LAUNCHKIT_TRACKING = {
    lpId: "${lpId}",
    apiBase: "https://autostudio-self.vercel.app"
  };
</script>
<script src="/assets/js/launchkit-tracking.js" defer></script>`;

  const configJson = `{
  "launchkit": {
    "lp_id": "${lpId}",
    "api_base": "https://autostudio-self.vercel.app"
  }
}`;

  const ctaSnippet = `<a href="https://liff.line.me/..." data-launchkit-line-cta>
  LINE登録はこちら
</a>`;

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="space-y-4 rounded border border-blue-200 bg-blue-50 p-4">
      <h2 className="text-sm font-semibold text-blue-900">計測設定（このLPのHTML/configに埋め込む）</h2>

      <div>
        <p className="mb-1 text-xs font-medium text-gray-700">LaunchKit configs/*.json に追加</p>
        <pre className="overflow-x-auto rounded bg-white p-3 text-xs">{configJson}</pre>
        <button
          type="button"
          onClick={() => copyToClipboard(configJson)}
          className="mt-1 text-xs text-blue-600 hover:underline"
        >
          {copied ? 'コピー済み' : 'コピー'}
        </button>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-gray-700">直接HTMLに埋め込む場合（テンプレ未対応LP用）</p>
        <pre className="overflow-x-auto rounded bg-white p-3 text-xs">{configSnippet}</pre>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-gray-700">CTAボタンの書き方（data-launchkit-line-cta必須）</p>
        <pre className="overflow-x-auto rounded bg-white p-3 text-xs">{ctaSnippet}</pre>
      </div>
    </section>
  );
}
