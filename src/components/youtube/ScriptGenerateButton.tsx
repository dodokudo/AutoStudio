'use client';

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
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResult(null);

    try {
      const sourceVideos = representativeVideo
        ? [`https://youtube.com/watch?v=${representativeVideo.videoId}`]
        : undefined;

      const response = await fetch('/api/youtube/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          themeKeyword,
          targetPersona: '月商1000万円を目指すマーケター',
          sourceVideos,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult(`台本生成完了！\nNotion Page ID: ${data.pageId}\nテーマ: ${data.themeKeyword}`);
      } else {
        setResult(`エラー: ${data.error}`);
      }
    } catch (error) {
      setResult(`エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed"
      >
        {isGenerating ? '台本生成中...' : '台本生成'}
      </button>
      {result && (
        <div className="mt-2 rounded-md border border-slate-700 bg-slate-800/50 p-2 text-xs">
          <pre className="whitespace-pre-wrap text-slate-300">{result}</pre>
        </div>
      )}
    </div>
  );
}