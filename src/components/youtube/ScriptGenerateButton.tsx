'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ScriptGenerateButtonProps {
  themeKeyword: string;
  representativeVideo?: {
    videoId: string;
    title: string;
    channelTitle?: string;
    channelId: string;
    viewCount?: number;
    viewVelocity?: number;
    engagementRate?: number;
  };
}

export function ScriptGenerateButton({ themeKeyword, representativeVideo }: ScriptGenerateButtonProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult(null);

    try {
      const response = await fetch('/api/youtube/scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          themeKeyword,
          videoType: 'B',
          notes: representativeVideo ? `主な参考動画: https://youtube.com/watch?v=${representativeVideo.videoId}` : undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult('台本を生成し、Notionに保存しました。');
        router.refresh();
      } else {
        setResult(`エラー: ${data.error ?? '未知のエラー'}`);
      }
    } catch (error) {
      setResult(`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-800"
      >
        {isGenerating ? '台本生成中...' : '台本生成'}
      </button>
      {result && (
        <p className="text-[11px] text-slate-400">{result}</p>
      )}
    </div>
  );
}
